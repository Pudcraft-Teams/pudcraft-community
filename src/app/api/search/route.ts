export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { searchQuerySchema } from "@/lib/validation";
import type { PostItem } from "@/lib/types";

/**
 * Extract a plain-text preview from content (truncated to maxLength).
 */
function extractContentPreview(content: string, maxLength = 200): string {
  return content.replace(/\n+/g, " ").trim().substring(0, maxLength);
}

/**
 * GET /api/search?q=xxx&cursor=xxx&limit=20
 *
 * Search types detected from `q`:
 * - `#xxx` -> tag search (by Tag name or aliases)
 * - `@xxx` -> user search (by name, contains, case-insensitive)
 * - otherwise -> text search (posts where title or content contains q)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const parsed = searchQuerySchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { q, cursor, limit } = parsed.data;
    const session = await auth();
    const userId = session?.user?.id;

    // ── Tag search: #xxx ──
    if (q.startsWith("#")) {
      const tagQuery = q.slice(1).trim().toLowerCase();
      if (!tagQuery) {
        return NextResponse.json({
          type: "tag",
          tag: null,
          posts: [],
          nextCursor: null,
        });
      }

      // Find tag by exact name or alias match
      const tag = await prisma.tag.findFirst({
        where: {
          OR: [
            { name: tagQuery },
            { aliases: { has: tagQuery } },
          ],
        },
        select: { id: true, name: true, displayName: true, postCount: true },
      });

      if (!tag) {
        return NextResponse.json({
          type: "tag",
          tag: null,
          posts: [],
          nextCursor: null,
        });
      }

      // Build cursor condition
      const where: Record<string, unknown> = {
        status: "PUBLISHED",
        postTags: { some: { tagId: tag.id } },
      };

      if (cursor) {
        const cursorPost = await prisma.post.findUnique({
          where: { id: cursor },
          select: { createdAt: true },
        });

        if (cursorPost) {
          where.OR = [
            { createdAt: { lt: cursorPost.createdAt } },
            { createdAt: cursorPost.createdAt, id: { lt: cursor } },
          ];
        }
      }

      const posts = await prisma.post.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: {
          author: { select: { id: true, uid: true, name: true, image: true } },
          circle: { select: { id: true, name: true, slug: true } },
          section: { select: { id: true, name: true } },
        },
      });

      const hasMore = posts.length > limit;
      const sliced = hasMore ? posts.slice(0, limit) : posts;
      const nextCursor =
        hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

      const items = await mapPostItems(sliced, userId);

      return NextResponse.json({
        type: "tag",
        tag: {
          name: tag.name,
          displayName: tag.displayName,
          postCount: tag.postCount,
        },
        posts: items,
        nextCursor,
      });
    }

    // ── User search: @xxx ──
    if (q.startsWith("@")) {
      const userQuery = q.slice(1).trim();
      if (!userQuery) {
        return NextResponse.json({
          type: "mention",
          users: [],
          posts: [],
          nextCursor: null,
        });
      }

      const users = await prisma.user.findMany({
        where: {
          name: { contains: userQuery, mode: "insensitive" },
          isBanned: false,
        },
        select: { id: true, uid: true, name: true, image: true },
        take: 20,
        orderBy: { uid: "asc" },
      });

      return NextResponse.json({
        type: "mention",
        users,
        posts: [],
        nextCursor: null,
      });
    }

    // ── Text search ──
    const where: Record<string, unknown> = {
      status: "PUBLISHED",
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ],
    };

    if (cursor) {
      const cursorPost = await prisma.post.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (cursorPost) {
        // For text search with cursor, use AND to combine with existing OR
        const cursorCondition = {
          OR: [
            { createdAt: { lt: cursorPost.createdAt } },
            { createdAt: cursorPost.createdAt, id: { lt: cursor } },
          ],
        };
        where.AND = cursorCondition;
      }
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        author: { select: { id: true, uid: true, name: true, image: true } },
        circle: { select: { id: true, name: true, slug: true } },
        section: { select: { id: true, name: true } },
      },
    });

    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor =
      hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    const items = await mapPostItems(sliced, userId);

    return NextResponse.json({
      type: "text",
      posts: items,
      nextCursor,
    });
  } catch (err) {
    logger.error("[api/search] Unexpected GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * Map raw Prisma post results to PostItem[], with batch liked/bookmarked checks.
 */
async function mapPostItems(
  posts: Array<{
    id: string;
    title: string;
    content: string;
    authorId: string;
    author: { id: string; uid: number; name: string | null; image: string | null };
    circleId: string | null;
    circle: { id: string; name: string; slug: string } | null;
    sectionId: string | null;
    section: { id: string; name: string } | null;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    isPinned: boolean;
    images: string[];
    createdAt: Date;
  }>,
  userId: string | undefined,
): Promise<PostItem[]> {
  const postIds = posts.map((p) => p.id);
  let likedPostIdSet = new Set<string>();
  let bookmarkedPostIdSet = new Set<string>();

  if (userId && postIds.length > 0) {
    const [likedPosts, bookmarkedPosts] = await Promise.all([
      prisma.postLike.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      }),
      prisma.bookmark.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      }),
    ]);

    likedPostIdSet = new Set(likedPosts.map((l) => l.postId));
    bookmarkedPostIdSet = new Set(bookmarkedPosts.map((b) => b.postId));
  }

  return posts.map((post) => ({
    id: post.id,
    title: post.title,
    contentPreview: extractContentPreview(post.content),
    authorId: post.authorId,
    author: post.author,
    circleId: post.circleId,
    circle: post.circle,
    sectionId: post.sectionId,
    section: post.section,
    viewCount: post.viewCount,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    isPinned: post.isPinned,
    images: post.images,
    isLiked: userId ? likedPostIdSet.has(post.id) : undefined,
    isBookmarked: userId ? bookmarkedPostIdSet.has(post.id) : undefined,
    createdAt: post.createdAt.toISOString(),
  }));
}
