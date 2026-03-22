export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { moderateContent } from "@/lib/moderation";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { getPublicUrl } from "@/lib/storage";
import type { ForumComment, ForumCommentResponse } from "@/lib/types";
import { commentQuerySchema, createForumCommentSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/posts/:id/comments
 * Flat comment list with cursor pagination. Public endpoint.
 * If parentCommentId is set, include parentAuthor info.
 * If user is logged in, batch check CommentLike for liked status.
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id: postId } = await params;

    // Verify post exists and is published
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true },
    });
    if (!post || post.status !== "PUBLISHED") {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = commentQuerySchema.safeParse({
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsedQuery.error.flatten() },
        { status: 400 },
      );
    }

    const { cursor, limit } = parsedQuery.data;

    // Build cursor-based where clause: (createdAt, id) cursor
    const where: {
      postId: string;
      status: "PUBLISHED";
      createdAt?: { lt: Date };
      OR?: Array<{ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } }>;
    } = {
      postId,
      status: "PUBLISHED",
    };

    if (cursor) {
      // Fetch the cursor comment to get its createdAt
      const cursorComment = await prisma.comment.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });
      if (cursorComment) {
        where.OR = [
          { createdAt: { lt: cursorComment.createdAt } },
          { createdAt: cursorComment.createdAt, id: { lt: cursor } },
        ];
      }
    }

    const comments = await prisma.comment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1, // fetch one extra to determine nextCursor
      include: {
        author: {
          select: { id: true, uid: true, name: true, image: true },
        },
      },
    });

    // Determine nextCursor
    const hasMore = comments.length > limit;
    const sliced = hasMore ? comments.slice(0, limit) : comments;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    // Collect parentCommentIds to batch-fetch parent authors
    const parentIds = sliced
      .map((c) => c.parentCommentId)
      .filter((id): id is string => id !== null);

    const parentAuthorsMap = new Map<string, { id: string; name: string | null }>();
    if (parentIds.length > 0) {
      const uniqueParentIds = [...new Set(parentIds)];
      const parentComments = await prisma.comment.findMany({
        where: { id: { in: uniqueParentIds } },
        select: {
          id: true,
          author: { select: { id: true, name: true } },
        },
      });
      for (const pc of parentComments) {
        parentAuthorsMap.set(pc.id, { id: pc.author.id, name: pc.author.name });
      }
    }

    // Check liked status if user is logged in
    const session = await auth();
    const currentUserId = session?.user?.id;
    const likedSet = new Set<string>();

    if (currentUserId && sliced.length > 0) {
      const commentIds = sliced.map((c) => c.id);
      const likes = await prisma.commentLike.findMany({
        where: { userId: currentUserId, commentId: { in: commentIds } },
        select: { commentId: true },
      });
      for (const like of likes) {
        likedSet.add(like.commentId);
      }
    }

    // Map to response format
    const mappedComments: ForumComment[] = sliced.map((c) => ({
      id: c.id,
      content: c.content,
      authorId: c.authorId,
      author: {
        id: c.author.id,
        uid: c.author.uid,
        name: c.author.name,
        image: getPublicUrl(c.author.image),
      },
      parentCommentId: c.parentCommentId,
      parentAuthor: c.parentCommentId
        ? (parentAuthorsMap.get(c.parentCommentId) ?? null)
        : null,
      likeCount: c.likeCount,
      isLiked: currentUserId ? likedSet.has(c.id) : undefined,
      createdAt: c.createdAt.toISOString(),
    }));

    const response: ForumCommentResponse = {
      comments: mappedComments,
      nextCursor,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error("[api/posts/[id]/comments] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/posts/:id/comments
 * Create a comment on a post. Requires active user.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`forum-comment:${userId}`, 5, 60);
    if (!limitResult.allowed) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const { id: postId } = await params;

    // Verify post exists and is published
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true, authorId: true, circleId: true },
    });
    if (!post || post.status !== "PUBLISHED") {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // If post belongs to a circle, verify user is a member and not banned
    if (post.circleId) {
      const [membership, ban] = await Promise.all([
        prisma.circleMembership.findUnique({
          where: {
            unique_circle_membership: { userId, circleId: post.circleId },
          },
          select: { id: true },
        }),
        prisma.circleBan.findUnique({
          where: {
            unique_circle_ban: { userId, circleId: post.circleId },
          },
          select: { id: true, expiresAt: true },
        }),
      ]);

      // Check if banned (and ban hasn't expired)
      if (ban) {
        const isExpired = ban.expiresAt && ban.expiresAt < new Date();
        if (!isExpired) {
          return NextResponse.json({ error: "你已被该圈子封禁" }, { status: 403 });
        }
      }

      if (!membership) {
        return NextResponse.json({ error: "你不是该圈子的成员" }, { status: 403 });
      }
    }

    const body = await request.json().catch(() => null);
    const parsedBody = createForumCommentSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const { content, parentCommentId } = parsedBody.data;

    // Content moderation
    const modResult = await moderateContent(content, "comment", {
      userId,
      userIp: getClientIp(request),
    });
    if (!modResult.passed) {
      return NextResponse.json(
        { error: "评论包含违规内容，请修改后重试", detail: modResult.reason },
        { status: 422 },
      );
    }

    // If replying to a parent comment, verify it exists and belongs to this post
    let parentAuthorId: string | null = null;
    if (parentCommentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentCommentId },
        select: { id: true, postId: true, authorId: true },
      });

      if (!parentComment || parentComment.postId !== postId) {
        return NextResponse.json(
          { error: "回复目标不存在或不属于当前帖子" },
          { status: 400 },
        );
      }
      parentAuthorId = parentComment.authorId;
    }

    // Transaction: create comment + increment Post.commentCount
    const comment = await prisma.$transaction(async (tx) => {
      const newComment = await tx.comment.create({
        data: {
          content,
          postId,
          authorId: userId,
          parentCommentId: parentCommentId ?? null,
        },
        include: {
          author: {
            select: { id: true, uid: true, name: true, image: true },
          },
        },
      });

      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });

      return newComment;
    });

    // Create notification (side effect, don't block main op)
    void createForumCommentNotification({
      postId,
      commentId: comment.id,
      parentCommentId: parentCommentId ?? null,
      parentAuthorId,
      postAuthorId: post.authorId,
      actorId: userId,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: comment.id,
          content: comment.content,
          authorId: comment.authorId,
          author: {
            id: comment.author.id,
            uid: comment.author.uid,
            name: comment.author.name,
            image: getPublicUrl(comment.author.image),
          },
          parentCommentId: comment.parentCommentId,
          parentAuthor: null,
          likeCount: 0,
          isLiked: false,
          createdAt: comment.createdAt.toISOString(),
        } satisfies ForumComment,
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("[api/posts/[id]/comments] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

// ─── Notification helper ────────────────────────────────

interface ForumCommentNotificationParams {
  postId: string;
  commentId: string;
  parentCommentId: string | null;
  parentAuthorId: string | null;
  postAuthorId: string;
  actorId: string;
}

async function createForumCommentNotification({
  postId,
  commentId,
  parentCommentId,
  parentAuthorId,
  postAuthorId,
  actorId,
}: ForumCommentNotificationParams): Promise<void> {
  try {
    if (parentCommentId && parentAuthorId) {
      // Reply to a comment -> notify parent comment author
      if (parentAuthorId !== actorId) {
        await prisma.notification.create({
          data: {
            recipientId: parentAuthorId,
            type: "COMMENT_REPLY",
            sourceUserId: actorId,
            postId,
            commentId,
          },
        });
      }
      return;
    }

    // Top-level comment -> notify post author
    if (postAuthorId !== actorId) {
      await prisma.notification.create({
        data: {
          recipientId: postAuthorId,
          type: "POST_COMMENT",
          sourceUserId: actorId,
          postId,
          commentId,
        },
      });
    }
  } catch (error) {
    logger.error("[api/posts/[id]/comments] Failed to create notification", error);
  }
}
