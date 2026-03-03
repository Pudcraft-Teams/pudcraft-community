export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * GET /api/notifications/unread-count
 * 获取当前用户未读通知数量。
 */
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const count = await prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    logger.error("[api/notifications/unread-count] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
