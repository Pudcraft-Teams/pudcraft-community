import fs from "fs/promises";
import path from "path";
import { z } from "zod";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

const imageMimeTypeSchema = z.enum(ALLOWED_IMAGE_MIME_TYPES);
const entityIdSchema = z.string().trim().min(1).regex(/^[a-zA-Z0-9_-]+$/, "实体 ID 格式不合法");
const MIME_EXTENSION_MAP: Record<AllowedImageMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const UPLOAD_URL_PREFIX = "/uploads";

type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

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

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function extractPathname(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      return new URL(input).pathname;
    } catch {
      return input;
    }
  }

  return input;
}

function normalizeUploadUrlPath(filePath: string): string | null {
  const pathname = extractPathname(filePath).split("?")[0].split("#")[0].trim();
  if (!pathname) {
    return null;
  }

  if (pathname.startsWith(`${UPLOAD_URL_PREFIX}/`)) {
    return pathname;
  }

  if (pathname.startsWith("uploads/")) {
    return `/${pathname}`;
  }

  if (pathname.startsWith("/avatars/") || pathname.startsWith("/server-icons/")) {
    return `${UPLOAD_URL_PREFIX}${pathname}`;
  }

  if (pathname.startsWith("avatars/") || pathname.startsWith("server-icons/")) {
    return `${UPLOAD_URL_PREFIX}/${pathname}`;
  }

  return null;
}

async function uploadImage(
  file: Buffer,
  entityId: string,
  mimeType: string,
  folder: "server-icons" | "avatars",
): Promise<string> {
  const parsedEntityId = entityIdSchema.parse(entityId);
  validateImageFile(file, mimeType);
  const parsedMimeType = imageMimeTypeSchema.parse(mimeType);

  const dir = path.join(UPLOAD_DIR, folder);
  await ensureDir(dir);

  const extension = MIME_EXTENSION_MAP[parsedMimeType];
  const filename = `${parsedEntityId}-${Date.now()}.${extension}`;
  await fs.writeFile(path.join(dir, filename), file);
  return `${UPLOAD_URL_PREFIX}/${folder}/${filename}`;
}

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
 * 上传服务器图标并返回可公开访问的 URL。
 */
export async function uploadServerIcon(
  file: Buffer,
  serverId: string,
  mimeType: string,
): Promise<string> {
  return uploadImage(file, serverId, mimeType, "server-icons");
}

/**
 * 上传用户头像并返回可公开访问的 URL。
 */
export async function uploadAvatar(file: Buffer, userId: string, mimeType: string): Promise<string> {
  return uploadImage(file, userId, mimeType, "avatars");
}

/**
 * 删除本地上传文件。
 */
export async function deleteFile(filePath: string): Promise<void> {
  const normalizedPath = normalizeUploadUrlPath(filePath);
  if (!normalizedPath) {
    return;
  }

  const absolutePath = path.resolve(PUBLIC_DIR, `.${normalizedPath}`);
  const uploadRoot = path.resolve(UPLOAD_DIR);
  if (!absolutePath.startsWith(`${uploadRoot}${path.sep}`)) {
    return;
  }

  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * 从本地静态文件 URL 中提取对象 key。
 */
export function getObjectKeyFromUrl(url: string): string | null {
  const normalizedPath = normalizeUploadUrlPath(url);
  if (!normalizedPath) {
    return null;
  }

  return normalizedPath.slice(`${UPLOAD_URL_PREFIX}/`.length);
}

export const imageUploadConstraints = {
  maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
} as const;
