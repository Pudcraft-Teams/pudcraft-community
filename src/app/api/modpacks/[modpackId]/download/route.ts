import { NextResponse } from "next/server";
import { Readable } from "stream";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createObjectReadStream, getObjectFileInfo } from "@/lib/storage";
import { modpackIdSchema } from "@/lib/validation";

function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function buildDownloadFilename(name: string, version: string | null): string {
  const safeName = sanitizeFilenamePart(name) || "modpack";
  const safeVersion = version ? sanitizeFilenamePart(version) : "";
  if (safeVersion) {
    return `${safeName}-${safeVersion}.mrpack`;
  }
  return `${safeName}.mrpack`;
}

/**
 * GET /api/modpacks/:modpackId/download — 下载整合包。
 * 未通过审核服务器的整合包仅 owner 可下载。
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
            isVerified: true,
          },
        },
      },
    });

    if (!modpack) {
      return NextResponse.json({ error: "整合包不存在或已删除" }, { status: 404 });
    }

    const session = await auth();
    const currentUserId = session?.user?.id;
    const isOwner = !!currentUserId && currentUserId === modpack.server.ownerId;
    if (!modpack.server.isVerified && !isOwner) {
      return NextResponse.json({ error: "服务器未通过审核，整合包暂不可公开下载" }, { status: 403 });
    }

    let fileSize = 0;
    try {
      const objectInfo = await getObjectFileInfo(modpack.fileKey);
      fileSize = objectInfo.size;
    } catch {
      return NextResponse.json({ error: "整合包文件不存在或已损坏" }, { status: 404 });
    }

    const stream = createObjectReadStream(modpack.fileKey);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    const filename = buildDownloadFilename(modpack.name, modpack.version);

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-modrinth-modpack+zip",
        "Content-Length": String(fileSize),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    logger.error("[api/modpacks/[modpackId]/download] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
