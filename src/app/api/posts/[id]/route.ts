export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { moderateContent } from "@/lib/moderation";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { unlinkTagsFromPost } from "@/lib/tags";
import { updatePostSchema } from "@/lib/validation";
import type { PostDetail } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/posts/:id -- Get post detail.
 * Returns full content, author, circle, section info.
 * Increments viewCount (fire-and-forget).
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    const session = await auth();
    const userId = session?.user?.id;
    const isAdmin = session?.user?.role === "admin";

    const post = await prisma.post.findUnique({
      where: { id },
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

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    // Deleted / Hidden posts: visible only to author, site admin, or circle admins
    if (post.status === "DELETED" || post.status === "HIDDEN") {
      const isAuthor = userId === post.authorId;

      let isCircleAdmin = false;
      if (userId && post.circleId && !isAdmin && !isAuthor) {
        const membership = await prisma.circleMembership.findUnique({
          where: {
            unique_circle_membership: {
              userId,
              circleId: post.circleId,
            },
          },
          select: { role: true },
        });
        isCircleAdmin = membership?.role === "OWNER" || membership?.role === "ADMIN";
      }

      if (!isAuthor && !isAdmin && !isCircleAdmin) {
        return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
      }
    }

    // Increment viewCount: logged-in users only, max 10 per user per post
    if (userId) {
      rateLimit(`post-view:${userId}:${id}`, 10, 86400)
        .then((rl) => {
          if (rl.allowed) {
            return prisma.post.update({
              where: { id },
              data: { viewCount: { increment: 1 } },
            });
          }
        })
        .catch(() => {});
    }

    let isLiked: boolean | undefined;
    let isBookmarked: boolean | undefined;

    if (userId) {
      const [like, bookmark] = await Promise.all([
        prisma.postLike.findUnique({
          where: {
            unique_post_like: {
              userId,
              postId: id,
            },
          },
          select: { id: true },
        }),
        prisma.bookmark.findUnique({
          where: {
            unique_bookmark: {
              userId,
              postId: id,
            },
          },
          select: { id: true },
        }),
      ]);

      isLiked = !!like;
      isBookmarked = !!bookmark;
    }

    const data: PostDetail = {
      id: post.id,
      title: post.title,
      content: post.content,
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
      isLiked,
      isBookmarked,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };

    return NextResponse.json({ data });
  } catch (err) {
    logger.error("[api/posts/[id]] Unexpected GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * PUT /api/posts/:id -- Update a post.
 * Must be: author, circle OWNER/ADMIN, or site admin.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const isAdmin = authResult.user.role === "admin";

    const { id } = await params;

    const post = await prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        circleId: true,
        status: true,
      },
    });

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    if (post.status === "DELETED") {
      return NextResponse.json({ error: "帖子已被删除" }, { status: 404 });
    }

    // Permission check
    const isAuthor = userId === post.authorId;
    let isCircleAdmin = false;

    if (post.circleId && !isAdmin && !isAuthor) {
      const membership = await prisma.circleMembership.findUnique({
        where: {
          unique_circle_membership: {
            userId,
            circleId: post.circleId,
          },
        },
        select: { role: true },
      });
      isCircleAdmin = membership?.role === "OWNER" || membership?.role === "ADMIN";
    }

    if (!isAuthor && !isAdmin && !isCircleAdmin) {
      return NextResponse.json({ error: "无权修改该帖子" }, { status: 403 });
    }

    const body: unknown = await request.json();
    const parsed = updatePostSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { title, content, sectionId } = parsed.data;

    // Moderate changed title if present
    if (title) {
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
    }

    // If sectionId is being updated and post belongs to a circle, verify section belongs to that circle
    if (sectionId !== undefined && sectionId !== null && post.circleId) {
      const section = await prisma.section.findUnique({
        where: { id: sectionId },
        select: { circleId: true },
      });

      if (!section || section.circleId !== post.circleId) {
        return NextResponse.json(
          { error: "板块不属于该圈子" },
          { status: 400 },
        );
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (sectionId !== undefined) updateData.sectionId = sectionId;

    const updated = await prisma.post.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        title: true,
        circleId: true,
        sectionId: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        title: updated.title,
        circleId: updated.circleId,
        sectionId: updated.sectionId,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    logger.error("[api/posts/[id]] Unexpected PUT error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/posts/:id -- Soft-delete a post.
 * Must be: author, circle OWNER/ADMIN, or site admin.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const isAdmin = authResult.user.role === "admin";

    const { id } = await params;

    const post = await prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        authorId: true,
        circleId: true,
        status: true,
      },
    });

    if (!post) {
      return NextResponse.json({ error: "帖子不存在" }, { status: 404 });
    }

    if (post.status === "DELETED") {
      return NextResponse.json({ success: true });
    }

    // Permission check
    const isAuthor = userId === post.authorId;
    let isCircleAdmin = false;

    if (post.circleId && !isAdmin && !isAuthor) {
      const membership = await prisma.circleMembership.findUnique({
        where: {
          unique_circle_membership: {
            userId,
            circleId: post.circleId,
          },
        },
        select: { role: true },
      });
      isCircleAdmin = membership?.role === "OWNER" || membership?.role === "ADMIN";
    }

    // For posts without a circle, must be author or site admin
    if (!post.circleId && !isAuthor && !isAdmin) {
      return NextResponse.json({ error: "无权删除该帖子" }, { status: 403 });
    }

    // For circle posts, must be author, circle admin, or site admin
    if (post.circleId && !isAuthor && !isAdmin && !isCircleAdmin) {
      return NextResponse.json({ error: "无权删除该帖子" }, { status: 403 });
    }

    // Soft delete; decrement circle.postCount if needed
    if (post.circleId) {
      await prisma.$transaction(async (tx) => {
        await unlinkTagsFromPost(tx, id);

        await tx.post.update({
          where: { id },
          data: { status: "DELETED" },
        });

        const updated = await tx.circle.update({
          where: { id: post.circleId! },
          data: { postCount: { decrement: 1 } },
          select: { postCount: true },
        });

        if (updated.postCount < 0) {
          await tx.circle.update({
            where: { id: post.circleId! },
            data: { postCount: 0 },
          });
        }
      });
    } else {
      await prisma.$transaction(async (tx) => {
        await unlinkTagsFromPost(tx, id);
        await tx.post.update({ where: { id }, data: { status: "DELETED" } });
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[api/posts/[id]] Unexpected DELETE error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
