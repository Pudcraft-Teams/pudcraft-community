export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveUserCuid } from "@/lib/lookup";
import { toPublicUserLookupId } from "@/lib/server-access";
import { getPublicUrl } from "@/lib/storage";
import type { ServerListItem } from "@/lib/types";
import { userLookupIdSchema } from "@/lib/validation";

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
    const parsedUserId = userLookupIdSchema.safeParse(id);
    if (!parsedUserId.success) {
      return NextResponse.json({ error: "无效的用户 ID 格式" }, { status: 400 });
    }

    const resolvedId = await resolveUserCuid(parsedUserId.data);
    if (!resolvedId) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const session = await auth();
    const canViewNonPublicServers =
      session?.user?.id === resolvedId || session?.user?.role === "admin";

    const user = await prisma.user.findUnique({
      where: { id: resolvedId },
      select: {
        id: true,
        uid: true,
        name: true,
        image: true,
        bio: true,
        createdAt: true,
        servers: {
          where: {
            status: "approved",
            ...(canViewNonPublicServers ? {} : { visibility: "public" }),
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
      psid: server.psid,
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
    }));

    return NextResponse.json({
      data: {
        id: toPublicUserLookupId(user.uid),
        uid: user.uid,
        name: user.name,
        image: getPublicUrl(user.image),
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
