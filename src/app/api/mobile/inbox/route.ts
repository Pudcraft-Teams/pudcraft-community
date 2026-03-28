export const dynamic = "force-dynamic";

import { requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { handleMobileInboxGet } from "@/lib/mobile/inboxFacade";

export async function GET(request: Request) {
  return handleMobileInboxGet(request, {
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
                  name: true,
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
        forumNotifications,
      };
    },
  });
}
