import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { deleteObject } from "@/lib/storage";
import { modpackIdSchema } from "@/lib/validation";

/**
 * DELETE /api/modpacks/:modpackId — 删除整合包（仅服务器 owner）。
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ modpackId: string }> },
) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tModpacks = await getTranslations({ locale, namespace: "errors.api.modpacks" });
  const tAuth = await getTranslations({ locale, namespace: "errors.api.auth" });
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { modpackId } = await params;
    const parsedId = modpackIdSchema.safeParse(modpackId);
    if (!parsedId.success) {
      return NextResponse.json({ error: tModpacks("invalidIdFormat") }, { status: 400 });
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
      return NextResponse.json({ error: tModpacks("notFound") }, { status: 404 });
    }

    if (!modpack.server.ownerId || modpack.server.ownerId !== userId) {
      return NextResponse.json({ error: tAuth("forbidden") }, { status: 403 });
    }

    await deleteObject(modpack.fileKey);

    await prisma.modpack.delete({
      where: { id: modpack.id },
    });

    return NextResponse.json({
      success: true,
      message: tModpacks("deleted"),
    });
  } catch (error) {
    logger.error("[api/modpacks/[modpackId]] Unexpected DELETE error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
