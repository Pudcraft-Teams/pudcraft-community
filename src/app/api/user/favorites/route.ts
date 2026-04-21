export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import { loadUserFavoriteServers } from "@/lib/userFavorites";

/**
 * GET /api/user/favorites
 * Returns the current user's favorited servers (newest-favorited first).
 */
export async function GET() {
  const locale = await getRequestLocale();
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
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
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
