export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/comments/:id/like
 * 点赞评论（幂等）。
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`comment-like:${userId}`, 30, 60);
    if (!limitResult.allowed) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const { id: commentId } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, likeCount: true, status: true },
    });
    if (!comment || comment.status === "DELETED") {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }

    const existingLike = await prisma.commentLike.findUnique({
      where: {
        unique_comment_like: {
          userId,
          commentId,
        },
      },
      select: { id: true },
    });

    if (existingLike) {
      return NextResponse.json({
        success: true,
        liked: true,
        likeCount: comment.likeCount,
      });
    }

    try {
      const likeCount = await prisma.$transaction(async (tx) => {
        await tx.commentLike.create({
          data: {
            userId,
            commentId,
          },
        });

        const updatedComment = await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });

        return updatedComment.likeCount;
      });

      return NextResponse.json({ success: true, liked: true, likeCount });
    } catch (error) {
      // 幂等处理：并发点赞触发唯一约束时按成功返回。
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const current = await prisma.comment.findUnique({
          where: { id: commentId },
          select: { likeCount: true },
        });

        return NextResponse.json({
          success: true,
          liked: true,
          likeCount: current?.likeCount ?? comment.likeCount,
        });
      }

      throw error;
    }
  } catch (error) {
    logger.error("[api/comments/[id]/like] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/comments/:id/like
 * 取消点赞评论（幂等）。
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`comment-like:${userId}`, 30, 60);
    if (!limitResult.allowed) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const { id: commentId } = await params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, status: true },
    });
    if (!comment || comment.status === "DELETED") {
      return NextResponse.json({ error: "评论不存在" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.commentLike.deleteMany({
        where: {
          userId,
          commentId,
        },
      });

      if (deleted.count === 0) {
        const current = await tx.comment.findUnique({
          where: { id: commentId },
          select: { likeCount: true },
        });

        return {
          likeCount: current?.likeCount ?? 0,
        };
      }

      const updated = await tx.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });

      // 防止并发导致负数
      if (updated.likeCount < 0) {
        await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: 0 },
        });
        return { likeCount: 0 };
      }

      return { likeCount: updated.likeCount };
    });

    return NextResponse.json({
      success: true,
      liked: false,
      likeCount: result.likeCount,
    });
  } catch (error) {
    logger.error("[api/comments/[id]/like] Unexpected DELETE error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
