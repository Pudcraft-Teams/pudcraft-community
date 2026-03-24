export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { PostItem } from "@/lib/types";

function extractContentPreview(content: string, maxLength = 200): string {
  return content.replace(/\n+/g, " ").trim().substring(0, maxLength);
}

/**
 * GET /api/user/bookmarks?cursor=xxx&limit=20
 * 获取当前用户收藏的帖子列表（按收藏时间倒序，游标分页）。
 */
export async function GET(request: Request) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 50);

    // Build cursor-based where clause
    const where: Record<string, unknown> = {
      userId,
      post: { status: "PUBLISHED" },
    };

    if (cursor) {
      const cursorBookmark = await prisma.bookmark.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (cursorBookmark) {
        where.OR = [
          { createdAt: { lt: cursorBookmark.createdAt } },
          { createdAt: cursorBookmark.createdAt, id: { lt: cursor } },
        ];
      }
    }

    const bookmarks = await prisma.bookmark.findMany({
      where,
      include: {
        post: {
          include: {
            author: {
              select: { id: true, uid: true, name: true, image: true },
            },
            circle: {
              select: { id: true, name: true, slug: true },
            },
            section: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = bookmarks.length > limit;
    const sliced = hasMore ? bookmarks.slice(0, limit) : bookmarks;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    const posts: PostItem[] = sliced.map((b) => ({
      id: b.post.id,
      title: b.post.title,
      contentPreview: extractContentPreview(b.post.content),
      authorId: b.post.authorId,
      author: b.post.author,
      circleId: b.post.circleId,
      circle: b.post.circle,
      sectionId: b.post.sectionId,
      section: b.post.section,
      viewCount: b.post.viewCount,
      likeCount: b.post.likeCount,
      commentCount: b.post.commentCount,
      isPinned: b.post.isPinned,
      images: b.post.images,
      isBookmarked: true,
      createdAt: b.post.createdAt.toISOString(),
    }));

    return NextResponse.json({ posts, nextCursor });
  } catch (err) {
    logger.error("[api/user/bookmarks] Unexpected GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
