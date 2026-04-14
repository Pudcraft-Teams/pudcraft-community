export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import { loadUserFavoriteServers } from "@/lib/userFavorites";

/**
 * GET /api/user/favorites
 * 获取当前用户收藏的服务器列表（按收藏时间倒序）。
 */
export async function GET() {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const currentUserRole = authResult.user.role;

    const data = await loadUserFavoriteServers(userId, currentUserRole);

    return NextResponse.json({
      data,
      pagination: {
        page: 1,
        pageSize: data.length,
        total: data.length,
        totalPages: 1,
      },
    });
  } catch (error) {
    logger.error("[api/user/favorites] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
