export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { canAccessServer } from "@/lib/server-access";
import { serverIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/servers/:id/favorite
 * 查询当前用户是否已收藏该服务器。
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`favorite:${userId}`, 30, 60);
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

    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_serverId: {
          userId,
          serverId: parsedServerId.data,
        },
      },
      select: { id: true },
    });

    return NextResponse.json({ favorited: !!favorite });
  } catch (error) {
    logger.error("[api/servers/[id]/favorite] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/servers/:id/favorite
 * 收藏服务器（幂等）。
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`favorite:${userId}`, 30, 60);
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
        favoriteCount: true,
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

    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        userId_serverId: {
          userId,
          serverId: parsedServerId.data,
        },
      },
      select: { id: true },
    });

    if (existingFavorite) {
      return NextResponse.json({
        success: true,
        favorited: true,
        favoriteCount: server.favoriteCount,
      });
    }

    try {
      const favoriteCount = await prisma.$transaction(async (tx) => {
        await tx.favorite.create({
          data: {
            userId,
            serverId: parsedServerId.data,
          },
        });

        const updatedServer = await tx.server.update({
          where: { id: parsedServerId.data },
          data: { favoriteCount: { increment: 1 } },
          select: { favoriteCount: true },
        });

        return updatedServer.favoriteCount;
      });

      return NextResponse.json({ success: true, favorited: true, favoriteCount });
    } catch (error) {
      // 幂等处理：并发收藏触发唯一约束时按成功返回。
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const current = await prisma.server.findUnique({
          where: { id: parsedServerId.data },
          select: { favoriteCount: true },
        });

        return NextResponse.json({
          success: true,
          favorited: true,
          favoriteCount: current?.favoriteCount ?? server.favoriteCount,
        });
      }

      throw error;
    }
  } catch (error) {
    logger.error("[api/servers/[id]/favorite] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/servers/:id/favorite
 * 取消收藏（幂等）。
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`favorite:${userId}`, 30, 60);
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

    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.favorite.deleteMany({
        where: {
          userId,
          serverId: parsedServerId.data,
        },
      });

      if (deleted.count === 0) {
        const current = await tx.server.findUnique({
          where: { id: parsedServerId.data },
          select: { favoriteCount: true },
        });

        return {
          favoriteCount: current?.favoriteCount ?? 0,
        };
      }

      const updated = await tx.server.update({
        where: { id: parsedServerId.data },
        data: { favoriteCount: { decrement: 1 } },
        select: { favoriteCount: true },
      });

      // 防止并发导致负数
      if (updated.favoriteCount < 0) {
        await tx.server.update({
          where: { id: parsedServerId.data },
          data: { favoriteCount: 0 },
        });
        return { favoriteCount: 0 };
      }

      return { favoriteCount: updated.favoriteCount };
    });

    return NextResponse.json({
      success: true,
      favorited: false,
      favoriteCount: result.favoriteCount,
    });
  } catch (error) {
    logger.error("[api/servers/[id]/favorite] Unexpected DELETE error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
