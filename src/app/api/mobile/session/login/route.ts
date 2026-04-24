import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { getRequestLocale } from "@/i18n/locale";
import { logger } from "@/lib/logger";
import { handleMobileLoginPost } from "@/lib/mobile/sessionFacade";

export async function POST(request: Request) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  try {
    return await handleMobileLoginPost(request);
  } catch (error) {
    logger.error("[api/mobile/session/login] Unexpected POST error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
