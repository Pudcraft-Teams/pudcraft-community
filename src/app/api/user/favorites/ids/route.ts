export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * GET /api/user/favorites/ids
 * 返回当前用户收藏服务器 ID 列表（用于批量状态判断）。
 */
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      select: { serverId: true },
    });

    return NextResponse.json({
      serverIds: favorites.map((item) => item.serverId),
    });
  } catch (error) {
    logger.error("[api/user/favorites/ids] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
