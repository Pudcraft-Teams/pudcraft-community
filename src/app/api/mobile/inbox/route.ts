export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { handleMobileInboxGet } from "@/lib/mobile/inboxFacade";

export async function GET(request: Request) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tAuth = await getTranslations({ locale, namespace: "errors.api.auth" });
  const tNotifications = await getTranslations({
    locale,
    namespace: "errors.api.notifications",
  });
  try {
    return await handleMobileInboxGet(request, {
      requireActiveUserImpl: requireActiveUser,
      errorText: {
        notAuthenticated: tAuth("notAuthenticated"),
        validationFailed: tCommon("validationFailed"),
        paginationTooDeep: tNotifications("paginationTooDeep"),
      },
      zodErrorMap: getZodErrorMap(locale),
      loadServerInboxData: async ({ userId, unreadOnly, fetchLimit }) => {
        const serverWhere = {
          userId,
          ...(unreadOnly ? { readAt: null } : {}),
        };

        const [serverTotal, serverUnread, serverNotifications] = await Promise.all([
          prisma.serverNotification.count({ where: serverWhere }),
          prisma.serverNotification.count({
            where: {
              userId,
              readAt: null,
            },
          }),
          prisma.serverNotification.findMany({
            where: serverWhere,
            orderBy: { createdAt: "desc" },
            take: fetchLimit,
            select: {
              id: true,
              title: true,
              message: true,
              link: true,
              readAt: true,
              createdAt: true,
            },
          }),
        ]);

        return {
          serverTotal,
          serverUnread,
          serverNotifications,
        };
      },
    });
  } catch (error) {
    logger.error("[api/mobile/inbox] Unexpected GET error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
