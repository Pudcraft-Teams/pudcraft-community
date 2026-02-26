import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { serverIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string; commentId: string }>;
}

/**
 * DELETE /api/servers/:id/comments/:commentId
 * 删除评论（评论作者或管理员可删除）。
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const userRole = authResult.user.role;

    const { id, commentId } = await params;
    const parsedServerId = serverIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const parsedCommentId = serverIdSchema.safeParse(commentId);
    if (!parsedCommentId.success) {
      return NextResponse.json({ error: "无效的评论 ID 格式" }, { status: 400 });
    }

    const comment = await prisma.comment.findUnique({
      where: { id: parsedCommentId.data },
      select: {
        id: true,
        serverId: true,
        authorId: true,
        parentId: true,
      },
    });

    if (!comment || comment.serverId !== parsedServerId.data) {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }

    const isAdmin = userRole === "admin";
    if (!isAdmin && comment.authorId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const relatedCommentIds = await prisma.comment.findMany({
      where: {
        OR: [{ id: comment.id }, { parentId: comment.id }],
      },
      select: { id: true },
    });

    const targetIds = relatedCommentIds.map((item) => item.id);

    await prisma.$transaction([
      prisma.notification.deleteMany({
        where: {
          commentId: { in: targetIds },
        },
      }),
      prisma.comment.delete({
        where: { id: comment.id },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/servers/[id]/comments/[commentId]] Unexpected DELETE error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
