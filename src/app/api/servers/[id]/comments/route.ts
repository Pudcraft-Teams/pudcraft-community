import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notification";
import { rateLimit } from "@/lib/rate-limit";
import { canAccessServer } from "@/lib/server-access";
import { getPublicUrl } from "@/lib/storage";
import type { ServerComment } from "@/lib/types";
import { createCommentSchema, queryCommentsSchema, serverIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface CommentNotificationParams {
  serverId: string;
  commentId: string;
  parentId: string | null;
  actorId: string;
  actorName: string;
}

function getActorDisplayName(name: string | null | undefined): string {
  if (typeof name !== "string") {
    return "用户";
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : "用户";
}

async function createCommentNotification({
  serverId,
  commentId,
  parentId,
  actorId,
  actorName,
}: CommentNotificationParams): Promise<void> {
  try {
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        select: {
          authorId: true,
        },
      });

      if (parentComment && parentComment.authorId !== actorId) {
        await createNotification({
          userId: parentComment.authorId,
          type: "comment_reply",
          title: "新的评论回复",
          message: `${actorName} 回复了你的评论`,
          link: `/servers/${serverId}#comment-${commentId}`,
          serverId,
          commentId,
        });
      }

      return;
    }

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        ownerId: true,
        name: true,
      },
    });

    if (server?.ownerId && server.ownerId !== actorId) {
      await createNotification({
        userId: server.ownerId,
        type: "comment_reply",
        title: "新的服务器评论",
        message: `${actorName} 评论了「${server.name}」`,
        link: `/servers/${serverId}#comment-${commentId}`,
        serverId,
        commentId,
      });
    }
  } catch (error) {
    logger.error("[api/servers/[id]/comments] Failed to create notification", error);
  }
}

function mapComments(
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date;
    author: {
      id: string;
      name: string | null;
      image: string | null;
    };
    replies: Array<{
      id: string;
      content: string;
      createdAt: Date;
      author: {
        id: string;
        name: string | null;
        image: string | null;
      };
    }>;
  }>,
): ServerComment[] {
  return comments.map((comment) => ({
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    author: {
      id: comment.author.id,
      name: comment.author.name,
      image: getPublicUrl(comment.author.image),
    },
    replies: comment.replies.map((reply) => ({
      id: reply.id,
      content: reply.content,
      createdAt: reply.createdAt.toISOString(),
      author: {
        id: reply.author.id,
        name: reply.author.name,
        image: getPublicUrl(reply.author.image),
      },
    })),
  }));
}

/**
 * GET /api/servers/:id/comments
 * 获取服务器顶层评论（含一层回复），支持分页。
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const parsedServerId = serverIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = queryCommentsSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsedQuery.error.flatten() },
        { status: 400 },
      );
    }

    const server = await prisma.server.findUnique({
      where: { id: parsedServerId.data },
      select: {
        id: true,
        status: true,
        ownerId: true,
      },
    });
    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    if (server.status !== "approved") {
      const session = await auth();
      const canAccessCurrentServer = canAccessServer({
        status: server.status,
        ownerId: server.ownerId,
        currentUserId: session?.user?.id,
        currentUserRole: session?.user?.role,
      });

      if (!canAccessCurrentServer) {
        return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
      }
    }

    const { page, limit } = parsedQuery.data;
    const where = {
      serverId: parsedServerId.data,
      parentId: null,
    };

    const [total, comments] = await Promise.all([
      prisma.comment.count({ where }),
      prisma.comment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          replies: {
            orderBy: { createdAt: "asc" },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      comments: mapComments(comments),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    logger.error("[api/servers/[id]/comments] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/servers/:id/comments
 * 发表评论或回复（仅支持两层：评论 -> 回复）。
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`comment:${userId}`, 5, 60);
    if (!limitResult.allowed) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const { id } = await params;
    const parsedServerId = serverIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const server = await prisma.server.findUnique({
      where: { id: parsedServerId.data },
      select: {
        id: true,
        status: true,
        ownerId: true,
      },
    });
    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const canAccessCurrentServer = canAccessServer({
      status: server.status,
      ownerId: server.ownerId,
      currentUserId: userId,
      currentUserRole: authResult.user.role,
    });
    if (!canAccessCurrentServer) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsedBody = createCommentSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const { content, parentId } = parsedBody.data;

    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: {
          id: true,
          serverId: true,
          parentId: true,
        },
      });

      if (!parent || parent.serverId !== parsedServerId.data) {
        return NextResponse.json({ error: "回复目标不存在或不属于当前服务器" }, { status: 400 });
      }

      if (parent.parentId) {
        return NextResponse.json({ error: "仅支持两层评论，不能回复子回复" }, { status: 400 });
      }
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        serverId: parsedServerId.data,
        authorId: userId,
        parentId: parentId ?? null,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    const actorName = getActorDisplayName(authResult.user.name);
    void createCommentNotification({
      serverId: parsedServerId.data,
      commentId: comment.id,
      parentId: comment.parentId,
      actorId: userId,
      actorName,
    });

    return NextResponse.json(
      {
        data: {
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt.toISOString(),
          parentId: comment.parentId,
          author: {
            id: comment.author.id,
            name: comment.author.name,
            image: getPublicUrl(comment.author.image),
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("[api/servers/[id]/comments] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
