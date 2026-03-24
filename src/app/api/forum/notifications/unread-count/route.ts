export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * GET /api/forum/notifications/unread-count
 * 获取当前用户未读论坛通知数量。
 */
export async function GET() {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const count = await prisma.notification.count({
      where: {
        recipientId: userId,
        isRead: false,
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    logger.error("[api/forum/notifications/unread-count] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
