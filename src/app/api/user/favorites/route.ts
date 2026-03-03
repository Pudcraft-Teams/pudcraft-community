export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getPublicUrl } from "@/lib/storage";
import type { ServerListItem } from "@/lib/types";

/**
 * GET /api/user/favorites
 * 获取当前用户收藏的服务器列表（按收藏时间倒序）。
 */
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            host: true,
            port: true,
            description: true,
            tags: true,
            iconUrl: true,
            favoriteCount: true,
            isVerified: true,
            verifiedAt: true,
            isOnline: true,
            playerCount: true,
            maxPlayers: true,
            lastPingedAt: true,
            updatedAt: true,
            status: true,
            rejectReason: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const data: ServerListItem[] = favorites.map((favorite) => {
      const server = favorite.server;
      return {
        id: server.id,
        name: server.name,
        host: server.host,
        port: server.port,
        description: server.description,
        tags: server.tags,
        iconUrl: getPublicUrl(server.iconUrl),
        favoriteCount: server.favoriteCount,
        isVerified: server.isVerified,
        verifiedAt: server.verifiedAt?.toISOString() ?? null,
        status: {
          online: server.isOnline,
          playerCount: server.playerCount,
          maxPlayers: server.maxPlayers,
          motd: null,
          favicon: null,
          checkedAt: (server.lastPingedAt ?? server.updatedAt).toISOString(),
        },
      };
    });

    return NextResponse.json({
      data,
      pagination: {
        page: 1,
        pageSize: data.length,
        total: data.length,
        totalPages: 1,
      },
    });
  } catch (error) {
    logger.error("[api/user/favorites] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
