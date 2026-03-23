export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { moderateContent } from "@/lib/moderation";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { notifyMentionedUsers } from "@/lib/mentions";
import { linkTagsToPost } from "@/lib/tags";
import { createPostSchema, feedQuerySchema } from "@/lib/validation";
import type { PostItem, PostFeedResponse } from "@/lib/types";

/**
 * Extract a plain-text preview from content (truncated to maxLength).
 */
function extractContentPreview(content: string, maxLength = 200): string {
  return content.replace(/\n+/g, " ").trim().substring(0, maxLength);
}

/**
 * GET /api/posts -- Feed endpoint with cursor pagination.
 * Supports filtering by circleId, sectionId, authorId.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const parsed = feedQuerySchema.safeParse({
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      circleId: searchParams.get("circleId") ?? undefined,
      sectionId: searchParams.get("sectionId") ?? undefined,
      authorId: searchParams.get("authorId") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { cursor, limit, circleId, sectionId, authorId } = parsed.data;

    // Build WHERE conditions
    const where: Record<string, unknown> = {
      status: "PUBLISHED",
    };

    if (circleId) {
      where.circleId = circleId;
    }

    if (sectionId) {
      where.sectionId = sectionId;
    }

    if (authorId) {
      where.authorId = authorId;
    }

    // Cursor pagination: fetch cursor post's createdAt for stable ordering
    if (cursor) {
      const cursorPost = await prisma.post.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (cursorPost) {
        where.OR = [
          { createdAt: { lt: cursorPost.createdAt } },
          {
            createdAt: cursorPost.createdAt,
            id: { lt: cursor },
          },
        ];
      }
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
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
    });

    // Determine if there are more results
    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    // If user is logged in, batch check liked/bookmarked status
    const session = await auth();
    const userId = session?.user?.id;

    const postIds = sliced.map((p) => p.id);
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

    const items: PostItem[] = sliced.map((post) => ({
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

    const response: PostFeedResponse = {
      posts: items,
      nextCursor,
    };

    return NextResponse.json(response);
  } catch (err) {
    logger.error("[api/posts] Unexpected GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/posts -- Create a new post.
 * Requires authenticated active user.
 */
export async function POST(request: Request) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const rl = await rateLimit(`post-create:${userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const body: unknown = await request.json();
    const parsed = createPostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { title, content, circleId, sectionId, tags, images } = parsed.data;

    // Circle-related validations
    if (circleId) {
      const circle = await prisma.circle.findUnique({
        where: { id: circleId },
        select: { id: true },
      });

      if (!circle) {
        return NextResponse.json({ error: "圈子不存在" }, { status: 404 });
      }

      // Verify user is a member of the circle
      const membership = await prisma.circleMembership.findUnique({
        where: {
          unique_circle_membership: {
            userId,
            circleId,
          },
        },
        select: { id: true },
      });

      if (!membership) {
        return NextResponse.json(
          { error: "你还不是该圈子的成员" },
          { status: 403 },
        );
      }

      // Check if user is banned in the circle
      const ban = await prisma.circleBan.findUnique({
        where: {
          unique_circle_ban: {
            circleId,
            userId,
          },
        },
        select: { expiresAt: true },
      });

      if (ban && (!ban.expiresAt || ban.expiresAt > new Date())) {
        return NextResponse.json(
          { error: "你已被该圈子封禁" },
          { status: 403 },
        );
      }

      // If sectionId provided, verify it belongs to the circle
      if (sectionId) {
        const section = await prisma.section.findUnique({
          where: { id: sectionId },
          select: { circleId: true },
        });

        if (!section || section.circleId !== circleId) {
          return NextResponse.json(
            { error: "板块不属于该圈子" },
            { status: 400 },
          );
        }
      }
    }

    // Content moderation on title
    const clientIp = getClientIp(request);
    const modResult = await moderateContent(title, "comment", {
      userId,
      userIp: clientIp,
    });

    if (!modResult.passed) {
      return NextResponse.json(
        { error: "标题包含违规内容，请修改后重新提交", detail: modResult.reason },
        { status: 422 },
      );
    }

    // Create the post, increment circle.postCount if needed
    if (circleId) {
      const post = await prisma.$transaction(async (tx) => {
        const created = await tx.post.create({
          data: {
            title,
            content: content,
            authorId: userId,
            circleId,
            sectionId: sectionId ?? null,
            images,
          },
          select: {
            id: true,
            title: true,
            circleId: true,
            sectionId: true,
            createdAt: true,
          },
        });

        await tx.circle.update({
          where: { id: circleId },
          data: { postCount: { increment: 1 } },
        });

        if (tags.length > 0) {
          await linkTagsToPost(tx, created.id, tags);
        }

        return created;
      });

      // Fire-and-forget: notify mentioned users
      notifyMentionedUsers(post.id, userId, content);

      return NextResponse.json(
        {
          success: true,
          data: {
            id: post.id,
            title: post.title,
            circleId: post.circleId,
            sectionId: post.sectionId,
            createdAt: post.createdAt.toISOString(),
          },
        },
        { status: 201 },
      );
    }

    // No circle — direct post to the public square
    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          title,
          content: content,
          authorId: userId,
          circleId: null,
          sectionId: null,
          images,
        },
        select: {
          id: true,
          title: true,
          circleId: true,
          sectionId: true,
          createdAt: true,
        },
      });

      if (tags.length > 0) {
        await linkTagsToPost(tx, created.id, tags);
      }

      return created;
    });

    // Fire-and-forget: notify mentioned users
    notifyMentionedUsers(post.id, userId, content);

    return NextResponse.json(
      {
        success: true,
        data: {
          id: post.id,
          title: post.title,
          circleId: post.circleId,
          sectionId: post.sectionId,
          createdAt: post.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[api/posts] Unexpected POST error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
