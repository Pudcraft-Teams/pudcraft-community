export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const [serverUnread, forumUnread] = await Promise.all([
      prisma.serverNotification.count({ where: { userId, readAt: null } }),
      prisma.notification.count({ where: { recipientId: userId, isRead: false } }),
    ]);

    return NextResponse.json({ total: serverUnread + forumUnread, serverUnread, forumUnread });
  } catch (error) {
    logger.error("[api/mobile/inbox/unread-summary] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
