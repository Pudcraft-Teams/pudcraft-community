export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { PostItem } from "@/lib/types";

function extractContentPreview(content: string, maxLength = 200): string {
  return content.replace(/\n+/g, " ").trim().substring(0, maxLength);
}

/**
 * GET /api/user/bookmarks
 * 获取当前用户收藏的帖子列表（按收藏时间倒序）。
 */
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: { userId },
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
      orderBy: { createdAt: "desc" },
    });

    // Filter out deleted posts
    const posts: PostItem[] = bookmarks
      .filter((b) => b.post.status === "PUBLISHED")
      .map((b) => ({
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

    return NextResponse.json({ posts });
  } catch (err) {
    logger.error("[api/user/bookmarks] Unexpected GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
