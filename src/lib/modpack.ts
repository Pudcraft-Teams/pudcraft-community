import { createHash } from "crypto";
import path from "path";
import yauzl from "yauzl";
import { z } from "zod";

const MRPACK_EXTENSION = ".mrpack";
// MRPACK_MAX_FILE_SIZE_BYTES was lowered from 500MB to 50MB after a
// security review — reject oversize uploads before they reach storage.
const MRPACK_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MRPACK_MAX_ENTRY_COUNT = 10_000;
const MRPACK_MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const MRPACK_MAX_INDEX_BYTES = 5 * 1024 * 1024;

/**
 * User-visible modpack parse error. The `key` resolves to
 * `errors.api.modpacks.<key>` at the route-handler layer so the thrown
 * reason is localizable without baking copy into this module.
 */
export class ModpackError extends Error {
  readonly key: string;
  readonly params?: Record<string, string | number>;

  constructor(key: string, params?: Record<string, string | number>, message?: string) {
    super(message ?? key);
    this.name = "ModpackError";
    this.key = key;
    this.params = params;
  }
}

export const MODPACK_ERROR_KEYS = {
  emptyPath: "emptyPath",
  illegalPath: "illegalPath",
  absolutePath: "absolutePath",
  emptyDirName: "emptyDirName",
  pathTraversal: "pathTraversal",
  openZipFailed: "openZipFailed",
  readIndexFailed: "readIndexFailed",
  archiveCorrupted: "archiveCorrupted",
  entryCountExceeded: "entryCountExceeded",
  uncompressedExceeded: "uncompressedExceeded",
  multipleIndex: "multipleIndex",
  indexTooLarge: "indexTooLarge",
  indexReadFailed: "indexReadFailed",
  missingIndex: "missingIndex",
  invalidJson: "invalidJson",
  invalidStructure: "invalidStructure",
  invalidFilePath: "invalidFilePath",
  unsupportedExtension: "unsupportedExtension",
  emptyFile: "emptyFile",
  fileTooLarge: "fileTooLarge",
  modpackNameRequired: "modpackNameRequired",
  fallbackName: "fallbackName",
} as const;

const modrinthFileSchema = z
  .object({
    path: z.string().min(1),
    hashes: z
      .object({
        sha1: z.string().min(1),
        sha512: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

const modrinthIndexSchema = z
  .object({
    name: z.string().trim().min(1, MODPACK_ERROR_KEYS.modpackNameRequired),
    versionId: z.string().trim().optional(),
    summary: z.string().trim().optional(),
    dependencies: z.record(z.string()).optional(),
    files: z.array(modrinthFileSchema),
  })
  .passthrough();

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

function wrapAsModpackError(error: unknown, fallbackKey: string): ModpackError {
  if (error instanceof ModpackError) return error;
  if (error instanceof z.ZodError) {
    const first = error.issues[0]?.message;
    if (first && first in MODPACK_ERROR_KEYS) {
      return new ModpackError(first);
    }
    return new ModpackError(fallbackKey);
  }
  return new ModpackError(fallbackKey);
}

function normalizeArchivePath(rawPath: string): string {
  const value = rawPath.replace(/\\/g, "/").trim();
  if (!value) {
    throw new ModpackError(MODPACK_ERROR_KEYS.emptyPath);
  }

  if (value.includes("\u0000")) {
    throw new ModpackError(MODPACK_ERROR_KEYS.illegalPath);
  }

  if (value.startsWith("/") || /^[A-Za-z]:\//.test(value)) {
    throw new ModpackError(MODPACK_ERROR_KEYS.absolutePath);
  }

  const noTrailingSlash = value.endsWith("/") ? value.slice(0, -1) : value;
  if (!noTrailingSlash) {
    throw new ModpackError(MODPACK_ERROR_KEYS.emptyDirName);
  }

  const segments = noTrailingSlash.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new ModpackError(MODPACK_ERROR_KEYS.pathTraversal);
  }

  return segments.join("/");
}

function openZipFromBuffer(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, autoClose: false }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(error ?? new ModpackError(MODPACK_ERROR_KEYS.openZipFailed));
        return;
      }

      resolve(zipfile);
    });
  });
}

function readIndexEntry(zipfile: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new ModpackError(MODPACK_ERROR_KEYS.readIndexFailed));
        return;
      }

      const chunks: Buffer[] = [];
      let byteLength = 0;

      stream.on("data", (chunk: Buffer) => {
        byteLength += chunk.byteLength;
        if (byteLength > MRPACK_MAX_INDEX_BYTES) {
          stream.destroy(new ModpackError(MODPACK_ERROR_KEYS.indexTooLarge));
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

async function inspectMrpackArchive(
  buffer: Buffer,
): Promise<{ indexText: string; hasOverrides: boolean }> {
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
      finalize(
        error instanceof ModpackError
          ? error
          : new ModpackError(MODPACK_ERROR_KEYS.archiveCorrupted),
      );
    });

    zipfile.on("entry", (entry) => {
      if (settled) {
        return;
      }

      entryCount += 1;
      if (entryCount > MRPACK_MAX_ENTRY_COUNT) {
        finalize(
          new ModpackError(MODPACK_ERROR_KEYS.entryCountExceeded, {
            max: MRPACK_MAX_ENTRY_COUNT,
          }),
        );
        return;
      }

      totalUncompressedBytes += entry.uncompressedSize;
      if (totalUncompressedBytes > MRPACK_MAX_UNCOMPRESSED_BYTES) {
        finalize(
          new ModpackError(MODPACK_ERROR_KEYS.uncompressedExceeded, {
            maxMb: Math.floor(MRPACK_MAX_UNCOMPRESSED_BYTES / 1024 / 1024),
          }),
        );
        return;
      }

      let normalizedPath: string;
      try {
        normalizedPath = normalizeArchivePath(entry.fileName);
      } catch (error) {
        finalize(wrapAsModpackError(error, MODPACK_ERROR_KEYS.illegalPath));
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
          finalize(new ModpackError(MODPACK_ERROR_KEYS.multipleIndex));
          return;
        }

        if (entry.uncompressedSize > MRPACK_MAX_INDEX_BYTES) {
          finalize(new ModpackError(MODPACK_ERROR_KEYS.indexTooLarge));
          return;
        }

        void readIndexEntry(zipfile, entry)
          .then((text) => {
            indexText = text;
            zipfile.readEntry();
          })
          .catch((error) => {
            finalize(wrapAsModpackError(error, MODPACK_ERROR_KEYS.indexReadFailed));
          });
        return;
      }

      zipfile.readEntry();
    });

    zipfile.on("end", () => {
      if (!indexText) {
        finalize(new ModpackError(MODPACK_ERROR_KEYS.missingIndex));
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
    throw new ModpackError(MODPACK_ERROR_KEYS.unsupportedExtension);
  }

  if (fileSize <= 0) {
    throw new ModpackError(MODPACK_ERROR_KEYS.emptyFile);
  }

  if (fileSize > MRPACK_MAX_FILE_SIZE_BYTES) {
    throw new ModpackError(MODPACK_ERROR_KEYS.fileTooLarge, {
      maxMb: Math.floor(MRPACK_MAX_FILE_SIZE_BYTES / 1024 / 1024),
    });
  }
}

export async function parseMrpackFile(buffer: Buffer): Promise<ParsedMrpack> {
  const { indexText, hasOverrides } = await inspectMrpackArchive(buffer);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(indexText);
  } catch {
    throw new ModpackError(MODPACK_ERROR_KEYS.invalidJson);
  }

  let indexData: ModrinthIndex;
  try {
    indexData = modrinthIndexSchema.parse(parsedJson);
  } catch (error) {
    throw wrapAsModpackError(error, MODPACK_ERROR_KEYS.invalidStructure);
  }

  for (const item of indexData.files) {
    try {
      normalizeArchivePath(item.path);
    } catch (error) {
      throw wrapAsModpackError(error, MODPACK_ERROR_KEYS.invalidFilePath);
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

/**
 * Returns the fallback modpack name derived from the uploaded filename.
 * Returns an empty string when the filename has no usable base; the caller
 * is expected to fall back to a translated default.
 */
export function getFallbackModpackName(fileName: string): string {
  const trimmed = fileName.trim();
  const base = path.basename(trimmed, path.extname(trimmed)).trim();
  return base;
}

export const mrpackUploadConstraints = {
  maxFileSizeBytes: MRPACK_MAX_FILE_SIZE_BYTES,
  maxEntryCount: MRPACK_MAX_ENTRY_COUNT,
  maxUncompressedBytes: MRPACK_MAX_UNCOMPRESSED_BYTES,
} as const;
