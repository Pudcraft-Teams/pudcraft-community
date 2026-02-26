import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { ServerListItem } from "@/lib/types";
import { userIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/user/:id
 * 获取用户公开资料与其提交的服务器列表（不返回邮箱）。
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const parsedUserId = userIdSchema.safeParse(id);
    if (!parsedUserId.success) {
      return NextResponse.json({ error: "无效的用户 ID 格式" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: parsedUserId.data },
      select: {
        id: true,
        name: true,
        image: true,
        bio: true,
        createdAt: true,
        servers: {
          where: {
            status: "approved",
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const servers: ServerListItem[] = user.servers.map((server) => ({
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port,
      description: server.description,
      tags: server.tags,
      iconUrl: server.iconUrl,
      favoriteCount: server.favoriteCount,
      isVerified: server.isVerified,
      verifiedAt: server.verifiedAt?.toISOString() ?? null,
      status: {
        online: server.isOnline,
        playerCount: server.playerCount,
        maxPlayers: server.maxPlayers,
        motd: null,
        favicon: null,
        latencyMs: server.latency,
        checkedAt: (server.lastPingedAt ?? server.updatedAt).toISOString(),
      },
    }));

    return NextResponse.json({
      data: {
        id: user.id,
        name: user.name,
        image: user.image,
        bio: user.bio,
        createdAt: user.createdAt.toISOString(),
        servers,
      },
    });
  } catch (error) {
    logger.error("[api/user/[id]] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
