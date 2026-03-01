import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { deleteObject } from "@/lib/storage";
import { modpackIdSchema } from "@/lib/validation";

/**
 * DELETE /api/modpacks/:modpackId — 删除整合包（仅服务器 owner）。
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ modpackId: string }> },
) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { modpackId } = await params;
    const parsedId = modpackIdSchema.safeParse(modpackId);
    if (!parsedId.success) {
      return NextResponse.json({ error: "无效的整合包 ID 格式" }, { status: 400 });
    }

    const modpack = await prisma.modpack.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        fileKey: true,
        server: {
          select: {
            ownerId: true,
          },
        },
      },
    });

    if (!modpack) {
      return NextResponse.json({ error: "整合包不存在或已删除" }, { status: 404 });
    }

    if (!modpack.server.ownerId || modpack.server.ownerId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    await deleteObject(modpack.fileKey);

    await prisma.modpack.delete({
      where: { id: modpack.id },
    });

    return NextResponse.json({
      success: true,
      message: "整合包已删除",
    });
  } catch (error) {
    logger.error("[api/modpacks/[modpackId]] Unexpected DELETE error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
