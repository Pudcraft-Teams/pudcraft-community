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
 * POST /api/posts/:id/like
 * 点赞帖子（幂等）。
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`post-like:${userId}`, 30, 60);
    if (!limitResult.allowed) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const { id: postId } = await params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, likeCount: true, status: true },
    });
    if (!post || post.status === "DELETED") {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    const existingLike = await prisma.postLike.findUnique({
      where: {
        unique_post_like: {
          userId,
          postId,
        },
      },
      select: { id: true },
    });

    if (existingLike) {
      return NextResponse.json({
        success: true,
        liked: true,
        likeCount: post.likeCount,
      });
    }

    try {
      const likeCount = await prisma.$transaction(async (tx) => {
        await tx.postLike.create({
          data: {
            userId,
            postId,
          },
        });

        const updatedPost = await tx.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });

        return updatedPost.likeCount;
      });

      return NextResponse.json({ success: true, liked: true, likeCount });
    } catch (error) {
      // 幂等处理：并发点赞触发唯一约束时按成功返回。
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const current = await prisma.post.findUnique({
          where: { id: postId },
          select: { likeCount: true },
        });

        return NextResponse.json({
          success: true,
          liked: true,
          likeCount: current?.likeCount ?? post.likeCount,
        });
      }

      throw error;
    }
  } catch (error) {
    logger.error("[api/posts/[id]/like] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/posts/:id/like
 * 取消点赞（幂等）。
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`post-like:${userId}`, 30, 60);
    if (!limitResult.allowed) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const { id: postId } = await params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true },
    });
    if (!post || post.status === "DELETED") {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.postLike.deleteMany({
        where: {
          userId,
          postId,
        },
      });

      if (deleted.count === 0) {
        const current = await tx.post.findUnique({
          where: { id: postId },
          select: { likeCount: true },
        });

        return {
          likeCount: current?.likeCount ?? 0,
        };
      }

      const updated = await tx.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });

      // 防止并发导致负数
      if (updated.likeCount < 0) {
        await tx.post.update({
          where: { id: postId },
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
    logger.error("[api/posts/[id]/like] Unexpected DELETE error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
