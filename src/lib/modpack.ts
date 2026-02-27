import { createHash } from "crypto";
import path from "path";
import yauzl from "yauzl";
import { z } from "zod";

const MRPACK_EXTENSION = ".mrpack";
const MRPACK_MAX_FILE_SIZE_BYTES = 300 * 1024 * 1024;
const MRPACK_MAX_ENTRY_COUNT = 10_000;
const MRPACK_MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const MRPACK_MAX_INDEX_BYTES = 5 * 1024 * 1024;

const modrinthFileSchema = z.object({
  path: z.string().min(1),
  hashes: z.object({
    sha1: z.string().min(1),
    sha512: z.string().min(1),
  }).passthrough(),
}).passthrough();

const modrinthIndexSchema = z.object({
  name: z.string().trim().min(1, "整合包名称不能为空"),
  versionId: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  dependencies: z.record(z.string()).optional(),
  files: z.array(modrinthFileSchema),
}).passthrough();

type ModpackLoader = "fabric" | "forge" | "neoforge" | "quilt";
type ModrinthIndex = z.infer<typeof modrinthIndexSchema>;

export interface ParsedMrpack {
  name: string;
  version: string | null;
  loader: ModpackLoader | null;
  gameVersion: string | null;
  summary: string | null;
  modsCount: number;
  hasOverrides: boolean;
  mrIndex: ModrinthIndex;
}

function parseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function normalizeArchivePath(rawPath: string): string {
  const value = rawPath.replace(/\\/g, "/").trim();
  if (!value) {
    throw new Error("整合包内存在空文件路径");
  }

  if (value.includes("\u0000")) {
    throw new Error("整合包包含非法路径");
  }

  if (value.startsWith("/") || /^[A-Za-z]:\//.test(value)) {
    throw new Error("整合包包含绝对路径，已拒绝");
  }

  const noTrailingSlash = value.endsWith("/") ? value.slice(0, -1) : value;
  if (!noTrailingSlash) {
    throw new Error("整合包内存在空目录名");
  }

  const segments = noTrailingSlash.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("整合包包含路径穿越风险，已拒绝");
  }

  return segments.join("/");
}

function openZipFromBuffer(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, autoClose: false }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(error ?? new Error("无法读取整合包压缩文件"));
        return;
      }

      resolve(zipfile);
    });
  });
}

function readIndexEntry(
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<string> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error("无法读取 modrinth.index.json"));
        return;
      }

      const chunks: Buffer[] = [];
      let byteLength = 0;

      stream.on("data", (chunk: Buffer) => {
        byteLength += chunk.byteLength;
        if (byteLength > MRPACK_MAX_INDEX_BYTES) {
          stream.destroy(new Error("modrinth.index.json 文件过大"));
          return;
        }
        chunks.push(chunk);
      });

      stream.on("error", (streamError) => {
        reject(streamError);
      });

      stream.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });
  });
}

async function inspectMrpackArchive(buffer: Buffer): Promise<{ indexText: string; hasOverrides: boolean }> {
  const zipfile = await openZipFromBuffer(buffer);

  return new Promise((resolve, reject) => {
    let settled = false;
    let entryCount = 0;
    let totalUncompressedBytes = 0;
    let hasOverrides = false;
    let indexText: string | null = null;
    let indexFileCount = 0;

    const finalize = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      zipfile.removeAllListeners();
      try {
        zipfile.close();
      } catch {
        // ignore close error
      }

      if (error) {
        reject(error);
        return;
      }

      resolve({
        indexText: indexText as string,
        hasOverrides,
      });
    };

    zipfile.on("error", (error) => {
      finalize(error instanceof Error ? error : new Error("整合包压缩文件损坏"));
    });

    zipfile.on("entry", (entry) => {
      if (settled) {
        return;
      }

      entryCount += 1;
      if (entryCount > MRPACK_MAX_ENTRY_COUNT) {
        finalize(new Error(`整合包文件数量超过限制（最多 ${MRPACK_MAX_ENTRY_COUNT} 个）`));
        return;
      }

      totalUncompressedBytes += entry.uncompressedSize;
      if (totalUncompressedBytes > MRPACK_MAX_UNCOMPRESSED_BYTES) {
        finalize(
          new Error(
            `整合包解压后总大小超过限制（最多 ${Math.floor(
              MRPACK_MAX_UNCOMPRESSED_BYTES / 1024 / 1024,
            )} MB）`,
          ),
        );
        return;
      }

      let normalizedPath: string;
      try {
        normalizedPath = normalizeArchivePath(entry.fileName);
      } catch (error) {
        finalize(new Error(parseErrorMessage(error, "整合包包含非法路径")));
        return;
      }

      if (normalizedPath.startsWith("overrides/")) {
        hasOverrides = true;
      }

      if (entry.fileName.endsWith("/")) {
        zipfile.readEntry();
        return;
      }

      if (normalizedPath === "modrinth.index.json") {
        indexFileCount += 1;
        if (indexFileCount > 1) {
          finalize(new Error("整合包包含多个 modrinth.index.json"));
          return;
        }

        if (entry.uncompressedSize > MRPACK_MAX_INDEX_BYTES) {
          finalize(new Error("modrinth.index.json 文件过大"));
          return;
        }

        void readIndexEntry(zipfile, entry)
          .then((text) => {
            indexText = text;
            zipfile.readEntry();
          })
          .catch((error) => {
            finalize(
              new Error(parseErrorMessage(error, "读取 modrinth.index.json 失败")),
            );
          });
        return;
      }

      zipfile.readEntry();
    });

    zipfile.on("end", () => {
      if (!indexText) {
        finalize(new Error("整合包缺少 modrinth.index.json"));
        return;
      }
      finalize();
    });

    zipfile.readEntry();
  });
}

function resolveLoaderFromDependencies(
  dependencies: Record<string, string> | undefined,
): ModpackLoader | null {
  if (!dependencies) {
    return null;
  }

  if (typeof dependencies["fabric-loader"] === "string") {
    return "fabric";
  }
  if (typeof dependencies.forge === "string") {
    return "forge";
  }
  if (typeof dependencies.neoforge === "string") {
    return "neoforge";
  }
  if (typeof dependencies["quilt-loader"] === "string") {
    return "quilt";
  }

  return null;
}

function trimOrNull(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateMrpackFile(fileName: string, fileSize: number): void {
  const lowerName = fileName.trim().toLowerCase();
  if (!lowerName.endsWith(MRPACK_EXTENSION)) {
    throw new Error("仅支持上传 .mrpack 格式整合包");
  }

  if (fileSize <= 0) {
    throw new Error("整合包文件不能为空");
  }

  if (fileSize > MRPACK_MAX_FILE_SIZE_BYTES) {
    throw new Error(`整合包大小不能超过 ${Math.floor(MRPACK_MAX_FILE_SIZE_BYTES / 1024 / 1024)}MB`);
  }
}

export async function parseMrpackFile(buffer: Buffer): Promise<ParsedMrpack> {
  const { indexText, hasOverrides } = await inspectMrpackArchive(buffer);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(indexText);
  } catch {
    throw new Error("modrinth.index.json 不是合法 JSON");
  }

  let indexData: ModrinthIndex;
  try {
    indexData = modrinthIndexSchema.parse(parsedJson);
  } catch (error) {
    throw new Error(parseErrorMessage(error, "modrinth.index.json 结构不合法"));
  }

  for (const item of indexData.files) {
    try {
      normalizeArchivePath(item.path);
    } catch (error) {
      throw new Error(parseErrorMessage(error, "modrinth.index.json 包含非法 file.path"));
    }
  }

  const dependencies = indexData.dependencies;
  return {
    name: indexData.name.trim(),
    version: trimOrNull(indexData.versionId),
    loader: resolveLoaderFromDependencies(dependencies),
    gameVersion:
      dependencies && typeof dependencies.minecraft === "string"
        ? trimOrNull(dependencies.minecraft)
        : null,
    summary: trimOrNull(indexData.summary),
    modsCount: indexData.files.length,
    hasOverrides,
    mrIndex: indexData,
  };
}

export function hashFileBuffer(buffer: Buffer): { sha1: string; sha512: string } {
  return {
    sha1: createHash("sha1").update(buffer).digest("hex"),
    sha512: createHash("sha512").update(buffer).digest("hex"),
  };
}

export function getFallbackModpackName(fileName: string): string {
  const trimmed = fileName.trim();
  const base = path.basename(trimmed, path.extname(trimmed)).trim();
  return base || "未命名整合包";
}

export const mrpackUploadConstraints = {
  maxFileSizeBytes: MRPACK_MAX_FILE_SIZE_BYTES,
  maxEntryCount: MRPACK_MAX_ENTRY_COUNT,
  maxUncompressedBytes: MRPACK_MAX_UNCOMPRESSED_BYTES,
} as const;
