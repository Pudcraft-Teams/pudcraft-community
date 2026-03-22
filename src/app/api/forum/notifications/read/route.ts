export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { markNotificationsReadSchema } from "@/lib/validation";

/**
 * POST /api/forum/notifications/read
 * 批量标记当前用户的论坛通知为已读。
 */
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
      return NextResponse.json(
        { error: "校验失败", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    if ("all" in parsedBody.data) {
      await prisma.notification.updateMany({
        where: {
          recipientId: userId,
          isRead: false,
        },
        data: { isRead: true },
      });
    } else {
      await prisma.notification.updateMany({
        where: {
          recipientId: userId,
          id: { in: parsedBody.data.ids },
          isRead: false,
        },
        data: { isRead: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/forum/notifications/read] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
