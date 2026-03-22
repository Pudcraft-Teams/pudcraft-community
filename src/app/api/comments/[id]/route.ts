export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/comments/:id
 * Soft-delete a forum comment (set status to DELETED).
 * Allowed by: comment author, circle OWNER/ADMIN (for circle posts), or site admin.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const { id: userId, role: userRole } = authResult.user;

    const { id: commentId } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        authorId: true,
        status: true,
        postId: true,
        post: {
          select: { circleId: true },
        },
      },
    });

    if (!comment) {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }

    if (comment.status === "DELETED") {
      return NextResponse.json({ error: "评论已被删除" }, { status: 404 });
    }

    // Permission check: author, site admin, or circle OWNER/ADMIN
    const isAuthor = comment.authorId === userId;
    const isSiteAdmin = userRole === "admin";

    let isCircleAdmin = false;
    if (!isAuthor && !isSiteAdmin && comment.post.circleId) {
      const membership = await prisma.circleMembership.findUnique({
        where: {
          unique_circle_membership: { userId, circleId: comment.post.circleId },
        },
        select: { role: true },
      });
      if (membership && (membership.role === "OWNER" || membership.role === "ADMIN")) {
        isCircleAdmin = true;
      }
    }

    if (!isAuthor && !isSiteAdmin && !isCircleAdmin) {
      return NextResponse.json({ error: "无权删除此评论" }, { status: 403 });
    }

    // Transaction: soft-delete comment + decrement Post.commentCount
    await prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { status: "DELETED" },
      });

      const updated = await tx.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
        select: { commentCount: true },
      });

      if (updated.commentCount < 0) {
        await tx.post.update({
          where: { id: comment.postId },
          data: { commentCount: 0 },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/comments/[id]] Unexpected DELETE error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
