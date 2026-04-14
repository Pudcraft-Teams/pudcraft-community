export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { buildMobileInboxUnreadSummary } from "@/lib/mobile/inboxFacade";
import { markNotificationsReadSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
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
      await prisma.serverNotification.updateMany({
        where: {
          userId,
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    } else {
      await prisma.serverNotification.updateMany({
        where: {
          userId,
          id: { in: parsedBody.data.ids },
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    }

    const serverUnread = await prisma.serverNotification.count({
      where: {
        userId,
        readAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      ...buildMobileInboxUnreadSummary(serverUnread),
    });
  } catch (error) {
    logger.error("[api/mobile/inbox/read] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
