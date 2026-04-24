export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Readable } from "stream";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { canAccessServer } from "@/lib/server-access";
import { canSeeServerAddress } from "@/lib/server-membership";
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
  request: Request,
  { params }: { params: Promise<{ modpackId: string }> },
) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tModpacks = await getTranslations({ locale, namespace: "errors.api.modpacks" });
  try {
    const { modpackId } = await params;
    const parsedId = modpackIdSchema.safeParse(modpackId);
    if (!parsedId.success) {
      return NextResponse.json({ error: tModpacks("invalidIdFormat") }, { status: 400 });
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
            id: true,
            ownerId: true,
            status: true,
            visibility: true,
          },
        },
      },
    });

    if (!modpack) {
      return NextResponse.json({ error: tModpacks("notFound") }, { status: 404 });
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
        { error: tModpacks("downloadForbidden") },
        { status: 403 },
      );
    }

    const canView = await canSeeServerAddress(
      { visibility: modpack.server.visibility, ownerId: modpack.server.ownerId },
      session?.user?.id,
      session?.user?.role,
      modpack.server.id,
    );
    if (!canView) {
      return NextResponse.json(
        { error: tModpacks("downloadMemberOnly") },
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
        return NextResponse.json({ error: tModpacks("downloadSignFailed") }, { status: 500 });
      }
    }

    // 本地模式：使用流
    let fileSize = 0;
    try {
      const objectInfo = await getObjectFileInfo(modpack.fileKey);
      fileSize = objectInfo.size;
    } catch {
      return NextResponse.json({ error: tModpacks("downloadFileMissing") }, { status: 404 });
    }

    const stream = createObjectReadStream(modpack.fileKey);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    headers["Content-Length"] = String(fileSize);

    return new NextResponse(webStream, { status: 200, headers });
  } catch (error) {
    logger.error("[api/modpacks/[modpackId]/download] Unexpected GET error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
