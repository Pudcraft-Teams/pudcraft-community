export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Readable } from "stream";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { canAccessServer } from "@/lib/server-access";
import { createObjectReadStream, getObjectFileInfo, getSignedUrl } from "@/lib/storage";
import { modpackIdSchema } from "@/lib/validation";

const MRPACK_EXTENSION = ".mrpack";

function sanitizeAsciiFilenamePart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function sanitizeUtf8FilenamePart(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, "")
    .replace(/[\\/]+/g, "-")
    .trim()
    .slice(0, 80);
}

function buildDownloadFilename(name: string, version: string | null): string {
  const safeName = sanitizeUtf8FilenamePart(name) || "modpack";
  const safeVersion = version ? sanitizeUtf8FilenamePart(version) : "";
  if (safeVersion) {
    return `${safeName}-${safeVersion}${MRPACK_EXTENSION}`;
  }
  return `${safeName}${MRPACK_EXTENSION}`;
}

function buildAsciiFallbackFilename(filename: string): string {
  const baseName = filename.endsWith(MRPACK_EXTENSION)
    ? filename.slice(0, -MRPACK_EXTENSION.length)
    : filename;
  const safeBaseName = sanitizeAsciiFilenamePart(baseName) || "modpack";
  return `${safeBaseName}${MRPACK_EXTENSION}`;
}

function encodeContentDispositionFilename(filename: string): string {
  return encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function buildAttachmentContentDisposition(filename: string): string {
  const fallback = buildAsciiFallbackFilename(filename);
  const encodedFilename = encodeContentDispositionFilename(filename);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodedFilename}`;
}

const isObjectStorageDriver = () => {
  const driver = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  return driver === "s3" || driver === "oss";
};

/**
 * GET /api/modpacks/:modpackId/download — 下载整合包。
 * 未通过审核服务器的整合包仅 owner / admin 可下载。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ modpackId: string }> },
) {
  try {
    const { modpackId } = await params;
    const parsedId = modpackIdSchema.safeParse(modpackId);
    if (!parsedId.success) {
      return NextResponse.json({ error: "无效的整合包 ID 格式" }, { status: 400 });
    }

    const modpack = await prisma.modpack.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        name: true,
        version: true,
        fileKey: true,
        server: {
          select: {
            ownerId: true,
            status: true,
          },
        },
      },
    });

    if (!modpack) {
      return NextResponse.json({ error: "整合包不存在或已删除" }, { status: 404 });
    }

    const session = await auth();
    const canAccessCurrentServer = canAccessServer({
      status: modpack.server.status,
      ownerId: modpack.server.ownerId,
      currentUserId: session?.user?.id,
      currentUserRole: session?.user?.role,
    });
    if (!canAccessCurrentServer) {
      return NextResponse.json(
        { error: "服务器未通过审核，整合包暂不可公开下载" },
        { status: 403 },
      );
    }

    const filename = buildDownloadFilename(modpack.name, modpack.version);
    const contentDisposition = buildAttachmentContentDisposition(filename);
    const headers: Record<string, string> = {
      "Content-Type": "application/x-modrinth-modpack+zip",
      "Content-Disposition": contentDisposition,
      "Cache-Control": "private, max-age=0, must-revalidate",
    };

    if (isObjectStorageDriver()) {
      try {
        const signedUrl = await getSignedUrl(modpack.fileKey, {
          expiresInSeconds: 300,
          responseContentDisposition: contentDisposition,
          responseContentType: headers["Content-Type"],
        });
        return NextResponse.redirect(signedUrl, { status: 307 });
      } catch (error) {
        logger.error(
          "[api/modpacks/[modpackId]/download] Failed to sign object storage download URL",
          {
            modpackId: modpack.id,
            fileKey: modpack.fileKey,
            reason: error instanceof Error ? error.message : "unknown",
          },
        );
        return NextResponse.json({ error: "整合包下载链接生成失败" }, { status: 500 });
      }
    }

    // 本地模式：使用流
    let fileSize = 0;
    try {
      const objectInfo = await getObjectFileInfo(modpack.fileKey);
      fileSize = objectInfo.size;
    } catch {
      return NextResponse.json({ error: "整合包文件不存在或已损坏" }, { status: 404 });
    }

    const stream = createObjectReadStream(modpack.fileKey);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    headers["Content-Length"] = String(fileSize);

    return new NextResponse(webStream, { status: 200, headers });
  } catch (error) {
    logger.error("[api/modpacks/[modpackId]/download] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
