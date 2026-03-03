import nodeFs from "fs";
import fs from "fs/promises";
import { createHash, randomUUID } from "crypto";
import path from "path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getPresignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { moderateImage } from "@/lib/image-moderation";

import type { ImageModerationContext } from "@/lib/image-moderation";

// ─── 常量 ─────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

const imageMimeTypeSchema = z.enum(ALLOWED_IMAGE_MIME_TYPES);
const entityIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "实体 ID 格式不合法");
const MIME_EXTENSION_MAP: Record<AllowedImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MIME_FROM_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mrpack: "application/x-modrinth-modpack+zip",
};

const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const UPLOAD_URL_PREFIX = "/uploads";
const PRIVATE_STORAGE_DIR = path.join(process.cwd(), "storage");
const KNOWN_STORAGE_PREFIXES = [
  "avatars/",
  "server-icons/",
  "editor-images/",
  "modpacks/",
] as const;
const LOCAL_STORAGE_MARKERS = [
  "/public/uploads/",
  "public/uploads/",
  "/storage/",
  "storage/",
] as const;

type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

// ─── Driver 类型 ──────────────────────────────────────

type StorageDriver = "local" | "s3";

function getStorageDriver(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  if (driver === "local") {
    return "local";
  }
  if (driver === "s3" || driver === "oss") {
    return "s3";
  }
  return "local";
}

export interface ObjectStorageRuntimeConfig {
  bucket: string;
  region: string;
  endpoint: string | null;
  publicBaseUrl: string | null;
  accessKeyId: string;
  accessKeySecret: string;
  forcePathStyle: boolean;
}

function readStorageEnv(primaryKey: string, legacyKey: string): string | undefined {
  const primaryValue = process.env[primaryKey];
  if (typeof primaryValue === "string" && primaryValue.trim()) {
    return primaryValue.trim();
  }

  const legacyValue = process.env[legacyKey];
  return typeof legacyValue === "string" && legacyValue.trim() ? legacyValue.trim() : undefined;
}

function normalizeEndpoint(endpoint: string): string {
  return /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`;
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error("S3_FORCE_PATH_STYLE 必须是 true/false");
}

export function getObjectStorageRuntimeConfig(): ObjectStorageRuntimeConfig {
  const bucket = readStorageEnv("S3_BUCKET", "OSS_BUCKET");
  const accessKeyId = readStorageEnv("S3_ACCESS_KEY_ID", "OSS_ACCESS_KEY_ID");
  const accessKeySecret = readStorageEnv("S3_ACCESS_KEY_SECRET", "OSS_ACCESS_KEY_SECRET");
  const region = readStorageEnv("S3_REGION", "OSS_REGION");
  const endpoint = readStorageEnv("S3_ENDPOINT", "OSS_ENDPOINT");
  const publicBaseUrl = readStorageEnv("S3_PUBLIC_BASE_URL", "OSS_PUBLIC_BASE_URL") ?? null;
  const forcePathStyle = parseBooleanEnv(
    readStorageEnv("S3_FORCE_PATH_STYLE", "OSS_FORCE_PATH_STYLE"),
  );

  if (!bucket || !accessKeyId || !accessKeySecret) {
    throw new Error(
      "对象存储配置不完整：请检查 S3_BUCKET / S3_ACCESS_KEY_ID / S3_ACCESS_KEY_SECRET",
    );
  }

  if (!region && !endpoint) {
    throw new Error("对象存储配置不完整：请提供 S3_REGION 或 S3_ENDPOINT");
  }

  return {
    bucket,
    region: region ?? "auto",
    endpoint: endpoint ? normalizeEndpoint(endpoint) : null,
    publicBaseUrl: publicBaseUrl ? publicBaseUrl.replace(/\/+$/, "") : null,
    accessKeyId,
    accessKeySecret,
    forcePathStyle,
  };
}

function getObjectStoragePublicBaseUrl(): string {
  const config = getObjectStorageRuntimeConfig();
  if (config.publicBaseUrl) {
    return config.publicBaseUrl;
  }

  if (config.endpoint) {
    const endpointUrl = new URL(config.endpoint);
    const normalizedPath = endpointUrl.pathname.replace(/\/+$/, "");
    if (config.forcePathStyle) {
      return `${endpointUrl.origin}${normalizedPath}/${config.bucket}`.replace(/\/+$/, "");
    }
    return `${endpointUrl.protocol}//${config.bucket}.${endpointUrl.host}${normalizedPath}`.replace(
      /\/+$/,
      "",
    );
  }

  return `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
}

// ─── S3 兼容对象存储 Client（懒加载单例） ────────────

let objectStorageClientInstance: S3Client | null = null;

function getObjectStorageClient(): S3Client {
  if (objectStorageClientInstance) {
    return objectStorageClientInstance;
  }

  const config = getObjectStorageRuntimeConfig();

  objectStorageClientInstance = new S3Client({
    region: config.region,
    endpoint: config.endpoint ?? undefined,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.accessKeySecret,
    },
    forcePathStyle: config.forcePathStyle,
  });

  return objectStorageClientInstance;
}

async function streamBodyToBuffer(
  body: AsyncIterable<Uint8Array> | { transformToByteArray?: () => Promise<Uint8Array> },
): Promise<Buffer> {
  if ("transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  if (!(Symbol.asyncIterator in body)) {
    throw new Error("对象存储返回了不支持的响应体类型");
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function stripQueryAndHash(value: string): string {
  let nextValue = value;
  const hashIndex = nextValue.indexOf("#");
  if (hashIndex >= 0) {
    nextValue = nextValue.slice(0, hashIndex);
  }

  const queryIndex = nextValue.indexOf("?");
  if (queryIndex >= 0) {
    nextValue = nextValue.slice(0, queryIndex);
  }

  return nextValue;
}

function tryNormalizeObjectKey(objectKey: string): string | null {
  try {
    return normalizeObjectKey(objectKey);
  } catch {
    return null;
  }
}

function toLocalObjectKey(normalizedKey: string): string {
  return normalizedKey.startsWith(`${OSS_KEY_PREFIX}/`)
    ? normalizedKey.slice(OSS_KEY_PREFIX.length + 1)
    : normalizedKey;
}

function isPathInsideRoot(absolutePath: string, rootDir: string): boolean {
  const resolvedRoot = path.resolve(rootDir);
  return absolutePath === resolvedRoot || absolutePath.startsWith(`${resolvedRoot}${path.sep}`);
}

function getLocalBaseDir(localKey: string): string {
  return localKey.startsWith("modpacks/") ? PRIVATE_STORAGE_DIR : UPLOAD_DIR;
}

function getLocalPathCandidates(localKey: string): string[] {
  const preferredDirs = localKey.startsWith("modpacks/")
    ? [PRIVATE_STORAGE_DIR, UPLOAD_DIR]
    : [UPLOAD_DIR, PRIVATE_STORAGE_DIR];

  return preferredDirs.map((baseDir) => path.resolve(baseDir, localKey));
}

/**
 * 将任意历史存储值（key / URL / 旧路径 / 绝对路径）归一化为标准存储 key。
 */
export function coerceStorageKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = trimmed;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      candidate = new URL(candidate).pathname;
    } catch {
      return null;
    }
  }

  candidate = stripQueryAndHash(candidate).replace(/\\/g, "/").trim();
  if (!candidate) {
    return null;
  }

  const directKey = tryNormalizeObjectKey(candidate);
  if (directKey?.startsWith(`${OSS_KEY_PREFIX}/`)) {
    return directKey;
  }

  for (const marker of LOCAL_STORAGE_MARKERS) {
    const markerIndex = candidate.indexOf(marker);
    if (markerIndex >= 0) {
      candidate = candidate.slice(markerIndex + marker.length);
      break;
    }
  }

  candidate = candidate.replace(/^\/+/, "");
  if (candidate.startsWith("uploads/")) {
    candidate = candidate.slice("uploads/".length);
  }

  const normalizedCandidate = tryNormalizeObjectKey(candidate);
  if (!normalizedCandidate) {
    return null;
  }

  if (normalizedCandidate.startsWith(`${OSS_KEY_PREFIX}/`)) {
    return normalizedCandidate;
  }

  if (KNOWN_STORAGE_PREFIXES.some((prefix) => normalizedCandidate.startsWith(prefix))) {
    return `${OSS_KEY_PREFIX}/${normalizedCandidate}`;
  }

  return null;
}

/**
 * 解析本地 driver 下某个对象应落盘到的目录位置。
 */
export function resolveLocalStorageTarget(key: string): {
  visibility: "public" | "private";
  localKey: string;
  absolutePath: string;
} {
  const normalizedKey = normalizeObjectKey(key);
  const localKey = toLocalObjectKey(normalizedKey);
  const baseDir = getLocalBaseDir(localKey);
  const absolutePath = path.resolve(baseDir, localKey);

  if (!isPathInsideRoot(absolutePath, baseDir)) {
    throw new Error("存储对象路径非法");
  }

  return {
    visibility: localKey.startsWith("modpacks/") ? "private" : "public",
    localKey,
    absolutePath,
  };
}

// ─── 存储对象 Key 前缀 ───────────────────────────────

const OSS_KEY_PREFIX = "pudcraft";

// ─── 错误类 ──────────────────────────────────────────

export class ImageValidationError extends Error {
  readonly status: number;
  readonly code: "FILE_TOO_LARGE" | "INVALID_IMAGE_TYPE";

  constructor(code: "FILE_TOO_LARGE" | "INVALID_IMAGE_TYPE") {
    super(code === "FILE_TOO_LARGE" ? "图片大小不能超过 5MB" : "图片格式不受支持");
    this.name = "ImageValidationError";
    this.code = code;
    this.status = code === "FILE_TOO_LARGE" ? 413 : 400;
  }
}

export class ImageModerationError extends Error {
  readonly status = 422;
  readonly category?: string;

  constructor(reason: string, category?: string) {
    super(reason);
    this.name = "ImageModerationError";
    this.category = category;
  }
}

// ─── MIME 检测 ────────────────────────────────────────

function detectImageMimeType(file: Buffer): AllowedImageMimeType | null {
  if (file.byteLength < 12) {
    return null;
  }

  const isPng =
    file[0] === 0x89 &&
    file[1] === 0x50 &&
    file[2] === 0x4e &&
    file[3] === 0x47 &&
    file[4] === 0x0d &&
    file[5] === 0x0a &&
    file[6] === 0x1a &&
    file[7] === 0x0a;
  if (isPng) {
    return "image/png";
  }

  const isJpeg = file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff;
  if (isJpeg) {
    return "image/jpeg";
  }

  const header = file.toString("ascii", 0, 6);
  if (header === "GIF87a" || header === "GIF89a") {
    return "image/gif";
  }

  const riffHeader = file.toString("ascii", 0, 4);
  const webpHeader = file.toString("ascii", 8, 12);
  if (riffHeader === "RIFF" && webpHeader === "WEBP") {
    return "image/webp";
  }

  return null;
}

// ─── 工具函数 ─────────────────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * 生成文件内容 hash（用于文件名去重）。
 */
export function hashBuffer(buffer: Buffer, algorithm: "sha256" | "sha1" = "sha256"): string {
  return createHash(algorithm).update(buffer).digest("hex");
}

/**
 * 校验并规范化存储 key：禁止 ..、反斜杠、前导 /。
 */
function normalizeObjectKey(objectKey: string): string {
  const normalized = objectKey.replace(/\\/g, "/").trim().replace(/^\/+/, "");
  if (!normalized) {
    throw new Error("无效的存储对象 key");
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("存储对象 key 非法");
  }

  return segments.join("/");
}

/**
 * 从 key 推测 content-type。
 */
function guessContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_FROM_EXTENSION[ext] ?? "application/octet-stream";
}

// ─── 统一存储接口 ─────────────────────────────────────

/**
 * 上传对象到存储（S3 兼容对象存储或本地）。
 */
export async function putObject(opts: {
  key: string;
  body: Buffer;
  contentType?: string;
}): Promise<void> {
  const normalizedKey = normalizeObjectKey(opts.key);
  const contentType = opts.contentType ?? guessContentType(normalizedKey);
  const driver = getStorageDriver();

  if (driver === "s3") {
    const client = getObjectStorageClient();
    const config = getObjectStorageRuntimeConfig();
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: normalizedKey,
        Body: opts.body,
        ContentType: contentType,
      }),
    );
    return;
  }

  const target = resolveLocalStorageTarget(normalizedKey);

  await ensureDir(path.dirname(target.absolutePath));
  await fs.writeFile(target.absolutePath, opts.body);
}

/**
 * 删除存储对象。
 */
export async function deleteObject(key: string): Promise<void> {
  const normalizedKey = normalizeObjectKey(key);
  const driver = getStorageDriver();

  if (driver === "s3") {
    const client = getObjectStorageClient();
    const config = getObjectStorageRuntimeConfig();
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: normalizedKey,
        }),
      );
    } catch {
      // 对象存储删除不存在的 key 通常不报错，异常时忽略
    }
    return;
  }

  const localKey = toLocalObjectKey(normalizedKey);
  const candidates = getLocalPathCandidates(localKey);

  for (const absolutePath of candidates) {
    const root = absolutePath.startsWith(path.resolve(PRIVATE_STORAGE_DIR))
      ? PRIVATE_STORAGE_DIR
      : UPLOAD_DIR;
    if (!isPathInsideRoot(absolutePath, root)) {
      continue;
    }
    try {
      await fs.unlink(absolutePath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
}

/**
 * 检查对象是否存在。
 */
export async function objectExists(key: string): Promise<boolean> {
  const normalizedKey = normalizeObjectKey(key);
  const driver = getStorageDriver();

  if (driver === "s3") {
    const client = getObjectStorageClient();
    const config = getObjectStorageRuntimeConfig();
    try {
      await client.send(
        new HeadObjectCommand({
          Bucket: config.bucket,
          Key: normalizedKey,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  const localKey = toLocalObjectKey(normalizedKey);
  const candidates = getLocalPathCandidates(localKey);

  for (const absolutePath of candidates) {
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isFile()) return true;
    } catch {
      // continue
    }
  }
  return false;
}

/**
 * 获取公开访问 URL。
 * DB 存储的是 key，前端显示时通过此函数生成完整 URL。
 */
export function getPublicUrl(key: string | null | undefined): string | null {
  if (!key) return null;

  const normalizedKey = coerceStorageKey(key);
  if (!normalizedKey) {
    return null;
  }
  const driver = getStorageDriver();

  if (driver === "s3") {
    const baseUrl = getObjectStoragePublicBaseUrl();
    return `${baseUrl}/${normalizedKey}`;
  }

  // local driver: 去掉 pudcraft/ 前缀，映射到 /uploads/
  const localKey = toLocalObjectKey(normalizedKey);

  // 如果是 modpacks 开头，不可直接公开访问
  if (localKey.startsWith("modpacks/")) {
    return null;
  }

  return `${UPLOAD_URL_PREFIX}/${localKey}`;
}

/**
 * 获取签名下载 URL（用于私有文件如整合包）。
 */
export async function getSignedUrl(
  key: string,
  options:
    | number
    | {
        expiresInSeconds?: number;
        responseContentDisposition?: string;
        responseContentType?: string;
      } = 3600,
): Promise<string> {
  const normalizedKey = normalizeObjectKey(key);
  const driver = getStorageDriver();
  const resolvedOptions = typeof options === "number" ? { expiresInSeconds: options } : options;
  const expiresInSeconds = resolvedOptions.expiresInSeconds ?? 3600;

  if (driver === "s3") {
    const client = getObjectStorageClient();
    const config = getObjectStorageRuntimeConfig();
    return getPresignedUrl(
      client,
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: normalizedKey,
        ResponseContentDisposition: resolvedOptions.responseContentDisposition,
        ResponseContentType: resolvedOptions.responseContentType,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  throw new Error("getSignedUrl 仅支持 STORAGE_DRIVER=s3，请在调用方按 driver 分流");
}

/**
 * 获取对象信息（大小等）。
 */
export async function getObjectFileInfo(key: string): Promise<{ size: number }> {
  const normalizedKey = normalizeObjectKey(key);
  const driver = getStorageDriver();

  if (driver === "s3") {
    const client = getObjectStorageClient();
    const config = getObjectStorageRuntimeConfig();
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: normalizedKey,
      }),
    );
    const size = Number(result.ContentLength ?? 0);
    return { size };
  }

  // local
  const localKey = toLocalObjectKey(normalizedKey);
  const candidates = getLocalPathCandidates(localKey);

  for (const absolutePath of candidates) {
    try {
      const stats = await fs.stat(absolutePath);
      if (stats.isFile()) {
        return { size: stats.size };
      }
    } catch {
      // continue
    }
  }

  throw new Error("存储对象不存在");
}

/**
 * 获取对象的可读流（用于下载 stream）。
 */
export function createObjectReadStream(key: string): nodeFs.ReadStream {
  const normalizedKey = normalizeObjectKey(key);
  const driver = getStorageDriver();

  if (driver === "s3") {
    // 对象存储模式下不应使用本地流——改用 getObjectBuffer 或 getSignedUrl
    throw new Error("STORAGE_DRIVER=s3 时请使用 getObjectBuffer 或 getSignedUrl 下载");
  }

  const localKey = toLocalObjectKey(normalizedKey);
  const candidates = getLocalPathCandidates(localKey);

  for (const absolutePath of candidates) {
    const root = absolutePath.startsWith(path.resolve(PRIVATE_STORAGE_DIR))
      ? PRIVATE_STORAGE_DIR
      : UPLOAD_DIR;
    if (!isPathInsideRoot(absolutePath, root)) {
      continue;
    }
    if (nodeFs.existsSync(absolutePath)) {
      return nodeFs.createReadStream(absolutePath);
    }
  }

  throw new Error("存储对象不存在");
}

/**
 * 获取对象内容为 Buffer（对象存储模式下用于下载）。
 */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const normalizedKey = normalizeObjectKey(key);
  const driver = getStorageDriver();

  if (driver === "s3") {
    const client = getObjectStorageClient();
    const config = getObjectStorageRuntimeConfig();
    const result = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: normalizedKey,
      }),
    );

    if (!result.Body) {
      throw new Error("存储对象不存在");
    }

    return streamBodyToBuffer(
      result.Body as
        | AsyncIterable<Uint8Array>
        | {
            transformToByteArray?: () => Promise<Uint8Array>;
          },
    );
  }

  // local
  const localKey = toLocalObjectKey(normalizedKey);
  const candidates = getLocalPathCandidates(localKey);

  for (const absolutePath of candidates) {
    try {
      return await fs.readFile(absolutePath);
    } catch {
      // continue
    }
  }

  throw new Error("存储对象不存在");
}

// ─── 业务层函数（生成 key 并上传） ────────────────────

/**
 * 校验图片 MIME 与大小。
 */
export function validateImageFile(file: Buffer, mimeType: string): void {
  if (file.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new ImageValidationError("FILE_TOO_LARGE");
  }

  const parsedMimeType = imageMimeTypeSchema.safeParse(mimeType);
  if (!parsedMimeType.success) {
    throw new ImageValidationError("INVALID_IMAGE_TYPE");
  }

  const detectedMimeType = detectImageMimeType(file);
  if (!detectedMimeType || detectedMimeType !== parsedMimeType.data) {
    throw new ImageValidationError("INVALID_IMAGE_TYPE");
  }
}

/**
 * 生成标准对象存储 key。
 */
function buildImageKey(
  file: Buffer,
  entityId: string,
  mimeType: AllowedImageMimeType,
  folder: "server-icons" | "avatars" | "editor-images",
): string {
  const extension = MIME_EXTENSION_MAP[mimeType];
  const hash = hashBuffer(file).slice(0, 16);
  return `${OSS_KEY_PREFIX}/${folder}/${entityId}/${hash}.${extension}`;
}

const FOLDER_MODERATION_CONTEXT: Record<
  "server-icons" | "avatars" | "editor-images",
  ImageModerationContext
> = {
  avatars: "avatar",
  "server-icons": "server-icon",
  "editor-images": "editor-image",
};

export interface ImageUploadModerationOptions {
  userId?: string;
  userIp?: string;
}

/**
 * 获取已上传图片的完整公网 URL（用于图片审查 imageUrl 参数）。
 * 本地 driver 需要 NEXTAUTH_URL 才能拼出完整 URL。
 */
function getFullPublicUrl(key: string): string | null {
  const relativeUrl = getPublicUrl(key);
  if (!relativeUrl) return null;

  // S3 driver 返回的已是完整 URL
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;

  // local driver 返回相对路径（如 /uploads/...），需拼上站点域名
  const siteUrl = process.env.NEXTAUTH_URL?.replace(/\/+$/, "");
  if (!siteUrl) return null;

  return `${siteUrl}${relativeUrl}`;
}

/**
 * 上传图片，返回对象存储 key（不是 URL）。
 * 上传后会进行图片内容审查（如已启用），审查不通过则删除已上传文件。
 */
async function uploadImage(
  file: Buffer,
  entityId: string,
  mimeType: string,
  folder: "server-icons" | "avatars" | "editor-images",
  moderationOptions?: ImageUploadModerationOptions,
): Promise<string> {
  const parsedEntityId = entityIdSchema.parse(entityId);
  validateImageFile(file, mimeType);
  const parsedMimeType = imageMimeTypeSchema.parse(mimeType);

  // 先上传
  const key = buildImageKey(file, parsedEntityId, parsedMimeType, folder);
  await putObject({ key, body: file, contentType: parsedMimeType });

  // 图片内容审查（上传后，通过 imageUrl）
  const imageUrl = getFullPublicUrl(key);
  if (imageUrl) {
    const modResult = await moderateImage(imageUrl, FOLDER_MODERATION_CONTEXT[folder], {
      contentId: parsedEntityId,
      userId: moderationOptions?.userId,
      userIp: moderationOptions?.userIp,
    });
    if (!modResult.passed) {
      // 审查不通过，删除已上传文件
      await deleteObject(key).catch(() => {});
      throw new ImageModerationError(modResult.reason ?? "图片包含违规内容", modResult.category);
    }
  }

  return key;
}

/**
 * 上传服务器图标，返回 key。
 */
export async function uploadServerIcon(
  file: Buffer,
  serverId: string,
  mimeType: string,
  moderationOptions?: ImageUploadModerationOptions,
): Promise<string> {
  return uploadImage(file, serverId, mimeType, "server-icons", moderationOptions);
}

/**
 * 上传用户头像，返回 key。
 */
export async function uploadAvatar(
  file: Buffer,
  userId: string,
  mimeType: string,
  moderationOptions?: ImageUploadModerationOptions,
): Promise<string> {
  return uploadImage(file, userId, mimeType, "avatars", moderationOptions);
}

/**
 * 上传编辑器内图片，返回 key。
 */
export async function uploadEditorImage(
  file: Buffer,
  userId: string,
  mimeType: string,
  moderationOptions?: ImageUploadModerationOptions,
): Promise<string> {
  return uploadImage(file, userId, mimeType, "editor-images", moderationOptions);
}

/**
 * 上传服务器整合包，返回 key。
 */
export async function uploadModpack(file: Buffer, serverId: string): Promise<string> {
  const parsedServerId = entityIdSchema.parse(serverId);
  const uuid = randomUUID().replaceAll("-", "");
  const key = `${OSS_KEY_PREFIX}/modpacks/${parsedServerId}/${Date.now()}-${uuid}.mrpack`;
  await putObject({
    key,
    body: file,
    contentType: "application/x-modrinth-modpack+zip",
  });
  return key;
}

// ─── 兼容旧数据工具函数 ──────────────────────────────

/**
 * 从旧的本地 URL（如 /uploads/server-icons/xxx.png）提取为新的 key。
 * 用于兼容旧数据的 deleteFile 和迁移。
 */
export function legacyUrlToKey(url: string): string | null {
  return coerceStorageKey(url);
}

/**
 * 删除文件（兼容旧的 URL 格式和新的 key 格式）。
 */
export async function deleteFile(keyOrUrl: string): Promise<void> {
  const key = legacyUrlToKey(keyOrUrl) ?? keyOrUrl;
  await deleteObject(key);
}

/**
 * 从旧 URL 提取 key（兼容函数，供旧代码调用）。
 */
export function getObjectKeyFromUrl(url: string): string | null {
  return legacyUrlToKey(url);
}

export const imageUploadConstraints = {
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
} as const;

export { OSS_KEY_PREFIX, UPLOAD_DIR, PRIVATE_STORAGE_DIR, UPLOAD_URL_PREFIX };
