export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { markNotificationsReadSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const authResult = await requireActiveUser();
  if (isActiveUserError(authResult)) {
    return authResult.response;
  }
  const userId = authResult.user.id;

  const body = await request.json().catch(() => null);
  const parsedBody = markNotificationsReadSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "校验失败", details: parsedBody.error.flatten() }, { status: 400 });
  }

  if ("all" in parsedBody.data) {
    await Promise.all([
      prisma.serverNotification.updateMany({
        where: {
          userId,
          readAt: null,
        },
        data: { readAt: new Date() },
      }),
      prisma.notification.updateMany({
        where: {
          recipientId: userId,
          isRead: false,
        },
        data: { isRead: true },
      }),
    ]);
  } else {
    await Promise.all([
      prisma.serverNotification.updateMany({
        where: {
          userId,
          id: { in: parsedBody.data.ids },
          readAt: null,
        },
        data: { readAt: new Date() },
      }),
      prisma.notification.updateMany({
        where: {
          recipientId: userId,
          id: { in: parsedBody.data.ids },
          isRead: false,
        },
        data: { isRead: true },
      }),
    ]);
  }

  const [serverUnread, forumUnread] = await Promise.all([
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
  ]);

  return NextResponse.json({ success: true, unreadCount: serverUnread + forumUnread });
}
