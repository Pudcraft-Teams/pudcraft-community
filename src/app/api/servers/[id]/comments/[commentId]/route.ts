import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import { serverIdSchema, serverLookupIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string; commentId: string }>;
}

/**
 * DELETE /api/servers/:id/comments/:commentId
 * 删除评论（评论作者或管理员可删除）。
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tAuth = await getTranslations({ locale, namespace: "errors.api.auth" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  const tComments = await getTranslations({ locale, namespace: "errors.api.comments" });
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const userRole = authResult.user.role;

    const { id, commentId } = await params;
    const parsedServerId = serverLookupIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const serverId = await resolveServerCuid(parsedServerId.data);
    if (!serverId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const parsedCommentId = serverIdSchema.safeParse(commentId);
    if (!parsedCommentId.success) {
      return NextResponse.json({ error: tComments("invalidIdFormat") }, { status: 400 });
    }

    const comment = await prisma.serverComment.findUnique({
      where: { id: parsedCommentId.data },
      select: {
        id: true,
        serverId: true,
        authorId: true,
        parentId: true,
      },
    });

    if (!comment || comment.serverId !== serverId) {
      return NextResponse.json({ error: tComments("notFound") }, { status: 404 });
    }

    const isAdmin = userRole === "admin";
    if (!isAdmin && comment.authorId !== userId) {
      return NextResponse.json({ error: tAuth("forbidden") }, { status: 403 });
    }

    const relatedCommentIds = await prisma.serverComment.findMany({
      where: {
        OR: [{ id: comment.id }, { parentId: comment.id }],
      },
      select: { id: true },
    });

    const targetIds = relatedCommentIds.map((item) => item.id);

    await prisma.$transaction([
      prisma.serverNotification.deleteMany({
        where: {
          commentId: { in: targetIds },
        },
      }),
      prisma.serverComment.delete({
        where: { id: comment.id },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/servers/[id]/comments/[commentId]] Unexpected DELETE error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
