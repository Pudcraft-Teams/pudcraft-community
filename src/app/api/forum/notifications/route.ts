export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { queryNotificationsSchema } from "@/lib/validation";
import type { ForumNotificationItem } from "@/lib/types";

/**
 * GET /api/forum/notifications
 * 获取当前用户的论坛通知列表。
 */
export async function GET(request: Request) {
  try {
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
      return NextResponse.json(
        { error: "校验失败", details: parsedQuery.error.flatten() },
        { status: 400 },
      );
    }

    const { page, limit, unreadOnly } = parsedQuery.data;
    const where = {
      recipientId: userId,
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
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
              circleId: true,
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

    const items: ForumNotificationItem[] = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      sourceUser: {
        id: n.sourceUser.id,
        uid: n.sourceUser.uid,
        name: n.sourceUser.name,
        image: n.sourceUser.image,
      },
      post: n.post
        ? {
            id: n.post.id,
            title: n.post.title,
            circleId: n.post.circleId,
            circle: n.post.circle ? { slug: n.post.circle.slug } : null,
          }
        : null,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }));

    return NextResponse.json({
      notifications: items,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    logger.error("[api/forum/notifications] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
