export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * GET /api/notifications/unread-count
 * Returns the current user's unread notification count.
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

    const count = await prisma.serverNotification.count({
      where: {
        userId,
        readAt: null,
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    logger.error("[api/notifications/unread-count] Unexpected GET error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
