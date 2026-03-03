export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { markNotificationsReadSchema, queryNotificationsSchema } from "@/lib/validation";

/**
 * GET /api/notifications
 * 获取当前用户通知列表。
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

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
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [total, unreadCount, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          userId,
          readAt: null,
        },
      }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          link: true,
          readAt: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      notifications: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        link: notification.link,
        readAt: notification.readAt?.toISOString() ?? null,
        createdAt: notification.createdAt.toISOString(),
      })),
      total,
      unreadCount,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    logger.error("[api/notifications] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications
 * 批量标记当前用户通知为已读。
 */
export async function PATCH(request: Request) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const body = await request.json().catch(() => null);
    const parsedBody = markNotificationsReadSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const now = new Date();
    if ("all" in parsedBody.data) {
      await prisma.notification.updateMany({
        where: {
          userId,
          readAt: null,
        },
        data: { readAt: now },
      });
    } else {
      await prisma.notification.updateMany({
        where: {
          userId,
          id: { in: parsedBody.data.ids },
          readAt: null,
        },
        data: { readAt: now },
      });
    }

    const unreadCount = await prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });

    return NextResponse.json({ success: true, unreadCount });
  } catch (error) {
    logger.error("[api/notifications] Unexpected PATCH error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
