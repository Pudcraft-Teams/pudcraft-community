export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { buildMobileInboxUnreadSummary } from "@/lib/mobile/inboxFacade";

export async function GET() {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const serverUnread = await prisma.serverNotification.count({ where: { userId, readAt: null } });

    return NextResponse.json({
      total: serverUnread,
      ...buildMobileInboxUnreadSummary(serverUnread),
    });
  } catch (error) {
    logger.error("[api/mobile/inbox/unread-summary] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
