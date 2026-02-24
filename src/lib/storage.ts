import fs from "fs/promises";
import path from "path";
import { z } from "zod";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

const imageMimeTypeSchema = z.enum(ALLOWED_IMAGE_MIME_TYPES);
const entityIdSchema = z.string().min(1);
const WEBP_EXTENSION = "webp";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const UPLOAD_URL_PREFIX = "/uploads";

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

  const dir = path.join(UPLOAD_DIR, folder);
  await ensureDir(dir);

  const filename = `${parsedEntityId}.${WEBP_EXTENSION}`;
  await fs.writeFile(path.join(dir, filename), file);
  return `${UPLOAD_URL_PREFIX}/${folder}/${filename}`;
}

/**
 * 校验图片 MIME 与大小。
 */
export function validateImageFile(file: Buffer, mimeType: string): void {
  if (file.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error("图片大小不能超过 2MB");
  }

  imageMimeTypeSchema.parse(mimeType);
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
