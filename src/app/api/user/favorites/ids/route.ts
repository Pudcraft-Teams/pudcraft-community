export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * GET /api/user/favorites/ids
 * 返回当前用户收藏服务器 ID 列表（用于批量状态判断）。
 */
export async function GET() {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

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
