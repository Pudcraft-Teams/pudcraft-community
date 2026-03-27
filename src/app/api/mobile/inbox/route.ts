export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { mergeInboxItems, type MobileInboxItem } from "@/lib/mobile/inboxFacade";
import { prisma } from "@/lib/db";
import { queryNotificationsSchema } from "@/lib/validation";

function getForumInboxText(type: "POST_COMMENT" | "COMMENT_REPLY" | "MENTION", sourceUserName: string, postTitle: string) {
  if (type === "POST_COMMENT") {
    return {
      title: `${sourceUserName} 评论了你的帖子`,
      body: postTitle,
    };
  }

  if (type === "MENTION") {
    return {
      title: `${sourceUserName} 在帖子中提到了你`,
      body: postTitle,
    };
  }

  return {
    title: `${sourceUserName} 回复了你的评论`,
    body: postTitle,
  };
}

function getForumInboxDestination(post: { id: string; circle: { slug: string } | null } | null): string | null {
  if (!post) {
    return null;
  }

  if (post.circle) {
    return `/c/${post.circle.slug}/post/${post.id}`;
  }

  return `/post/${post.id}`;
}

export async function GET(request: Request) {
  const authResult = await requireActiveUser();
  if (isActiveUserError(authResult)) {
    return authResult.response;
  }
  const userId = authResult.user.id;

  const { searchParams } = new URL(request.url);
  const parsedQuery = queryNotificationsSchema.safeParse({
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    unreadOnly: searchParams.get("unreadOnly") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json({ error: "校验失败", details: parsedQuery.error.flatten() }, { status: 400 });
  }

  const { page, limit, unreadOnly } = parsedQuery.data;
  const fetchLimit = page * limit;
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

  const merged = mergeInboxItems(
    serverNotifications.map((notification): MobileInboxItem => ({
      id: notification.id,
      kind: "server",
      title: notification.title,
      body: notification.message,
      destination: notification.link,
      read: notification.readAt !== null,
      createdAt: notification.createdAt.toISOString(),
    })),
    forumNotifications.map((notification): MobileInboxItem => {
      const sourceUserName = notification.sourceUser.name ?? "未知用户";
      const postTitle = notification.post?.title ?? "某个帖子";
      const text = getForumInboxText(notification.type, sourceUserName, postTitle);

      return {
        id: notification.id,
        kind: "forum",
        title: text.title,
        body: text.body,
        destination: getForumInboxDestination(notification.post),
        read: notification.isRead,
        createdAt: notification.createdAt.toISOString(),
      };
    }),
  );

  const notifications = merged.slice((page - 1) * limit, page * limit);

  return NextResponse.json({
    notifications,
    total: serverTotal + forumTotal,
    unreadCount: serverUnread + forumUnread,
    page,
    totalPages: Math.max(1, Math.ceil((serverTotal + forumTotal) / limit)),
  });
}
