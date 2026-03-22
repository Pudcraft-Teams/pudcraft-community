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
 * POST /api/posts/:id/bookmark
 * 收藏帖子（幂等）。
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`bookmark:${userId}`, 30, 60);
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

    const existingBookmark = await prisma.bookmark.findUnique({
      where: {
        unique_bookmark: {
          userId,
          postId,
        },
      },
      select: { id: true },
    });

    if (existingBookmark) {
      return NextResponse.json({
        success: true,
        bookmarked: true,
      });
    }

    try {
      await prisma.bookmark.create({
        data: {
          userId,
          postId,
        },
      });

      return NextResponse.json({ success: true, bookmarked: true });
    } catch (error) {
      // 幂等处理：并发收藏触发唯一约束时按成功返回。
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({
          success: true,
          bookmarked: true,
        });
      }

      throw error;
    }
  } catch (error) {
    logger.error("[api/posts/[id]/bookmark] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/posts/:id/bookmark
 * 取消收藏帖子（幂等）。
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`bookmark:${userId}`, 30, 60);
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

    await prisma.bookmark.deleteMany({
      where: {
        userId,
        postId,
      },
    });

    return NextResponse.json({
      success: true,
      bookmarked: false,
    });
  } catch (error) {
    logger.error("[api/posts/[id]/bookmark] Unexpected DELETE error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
