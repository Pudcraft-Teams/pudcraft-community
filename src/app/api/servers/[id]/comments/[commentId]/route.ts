import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { serverIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string; commentId: string }>;
}

/**
 * DELETE /api/servers/:id/comments/:commentId
 * 删除评论（仅评论作者可删除）。
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

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
      },
    });

    if (!comment || comment.serverId !== parsedServerId.data) {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }

    if (comment.authorId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    await prisma.comment.delete({
      where: { id: comment.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/servers/[id]/comments/[commentId]] Unexpected DELETE error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
