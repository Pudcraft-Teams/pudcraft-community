import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { getRequestLocale } from "@/i18n/locale";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { handleMobileSessionDelete, handleMobileSessionGet } from "@/lib/mobile/sessionFacade";
import { getPublicUrl } from "@/lib/storage";

export async function GET(request: Request) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  try {
    return await handleMobileSessionGet(
      {
        authImpl: auth,
        loadUserById: async (userId) => {
          const user = await db.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              uid: true,
              name: true,
              email: true,
              image: true,
              role: true,
              isBanned: true,
            },
          });

          if (!user) {
            return null;
          }

          return {
            ...user,
            image: getPublicUrl(user.image),
          };
        },
      },
      locale,
    );
  } catch (error) {
    logger.error("[api/mobile/session] Unexpected GET error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  try {
    return await handleMobileSessionDelete(request);
  } catch (error) {
    logger.error("[api/mobile/session] Unexpected DELETE error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
