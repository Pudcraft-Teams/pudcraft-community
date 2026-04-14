export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { handleMobileInboxGet } from "@/lib/mobile/inboxFacade";

export async function GET(request: Request) {
  try {
    return await handleMobileInboxGet(request, {
      requireActiveUserImpl: requireActiveUser,
      loadServerInboxData: async ({ userId, unreadOnly, fetchLimit }) => {
        const serverWhere = {
          userId,
          ...(unreadOnly ? { readAt: null } : {}),
        };

        const [serverTotal, serverUnread, serverNotifications] = await Promise.all([
          prisma.serverNotification.count({ where: serverWhere }),
          prisma.serverNotification.count({
            where: {
              userId,
              readAt: null,
            },
          }),
          prisma.serverNotification.findMany({
            where: serverWhere,
            orderBy: { createdAt: "desc" },
            take: fetchLimit,
            select: {
              id: true,
              title: true,
              message: true,
              link: true,
              readAt: true,
              createdAt: true,
            },
          }),
        ]);

        return {
          serverTotal,
          forumTotal: 0,
          serverUnread,
          forumUnread: 0,
          serverNotifications,
          forumNotifications: [],
        };
      },
    });
  } catch (error) {
    logger.error("[api/mobile/inbox] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
