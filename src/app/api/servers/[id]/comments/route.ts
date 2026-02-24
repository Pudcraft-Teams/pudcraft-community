import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import type { ServerComment } from "@/lib/types";
import { createCommentSchema, queryCommentsSchema, serverIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function mapComments(comments: Array<{
  id: string;
  content: string;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  replies: Array<{
    id: string;
    content: string;
    createdAt: Date;
    author: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
    };
  }>;
}>): ServerComment[] {
  return comments.map((comment) => ({
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    author: {
      id: comment.author.id,
      name: comment.author.name,
      email: comment.author.email,
      image: comment.author.image,
    },
    replies: comment.replies.map((reply) => ({
      id: reply.id,
      content: reply.content,
      createdAt: reply.createdAt.toISOString(),
      author: {
        id: reply.author.id,
        name: reply.author.name,
        email: reply.author.email,
        image: reply.author.image,
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
      select: { id: true },
    });
    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
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
              email: true,
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
                  email: true,
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
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

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
      select: { id: true },
    });
    if (!server) {
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
            email: true,
            image: true,
          },
        },
      },
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
            email: comment.author.email,
            image: comment.author.image,
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
