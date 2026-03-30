export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getPublicUrl } from "@/lib/storage";
import { handleMobileInboxGet } from "@/lib/mobile/inboxFacade";

export async function GET(request: Request) {
  try {
    return await handleMobileInboxGet(request, {
      requireActiveUserImpl: requireActiveUser,
      loadInboxData: async ({ userId, unreadOnly, fetchLimit }) => {
        const serverWhere = {
          userId,
          ...(unreadOnly ? { readAt: null } : {}),
        };
        const forumWhere = {
          recipientId: userId,
          ...(unreadOnly ? { isRead: false } : {}),
        };

        const [serverTotal, forumTotal, serverUnread, forumUnread, serverNotifications, forumNotifications] =
          await Promise.all([
            prisma.serverNotification.count({ where: serverWhere }),
            prisma.notification.count({ where: forumWhere }),
            prisma.serverNotification.count({
              where: {
                userId,
                readAt: null,
              },
            }),
            prisma.notification.count({
              where: {
                recipientId: userId,
                isRead: false,
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
            prisma.notification.findMany({
              where: forumWhere,
              orderBy: { createdAt: "desc" },
              take: fetchLimit,
              select: {
                id: true,
                type: true,
                isRead: true,
                createdAt: true,
                sourceUser: {
                  select: {
                    id: true,
                    uid: true,
                    name: true,
                    image: true,
                  },
                },
                post: {
                  select: {
                    id: true,
                    title: true,
                    circle: {
                      select: {
                        slug: true,
                      },
                    },
                  },
                },
              },
            }),
          ]);

        return {
          serverTotal,
          forumTotal,
          serverUnread,
          forumUnread,
          serverNotifications,
          forumNotifications: forumNotifications.map((notification) => ({
            ...notification,
            sourceUser: {
              ...notification.sourceUser,
              image: getPublicUrl(notification.sourceUser.image),
            },
          })),
        };
      },
    });
  } catch (error) {
    logger.error("[api/mobile/inbox] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
