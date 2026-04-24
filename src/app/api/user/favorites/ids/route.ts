export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * GET /api/user/favorites/ids
 * Returns the current user's favorited server ids (for bulk status checks).
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

    const favorites = await prisma.favorite.findMany({
      where: { userId },
      select: { serverId: true },
    });

    return NextResponse.json({
      serverIds: favorites.map((item) => item.serverId),
    });
  } catch (error) {
    logger.error("[api/user/favorites/ids] Unexpected GET error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
