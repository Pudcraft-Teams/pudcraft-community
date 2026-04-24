export const dynamic = "force-dynamic";

import { createTranslator } from "next-intl";
import { logger } from "@/lib/logger";
import type { Locale } from "@/i18n/config";
import zhMessages from "../../../../messages/zh.json";
import enMessages from "../../../../messages/en.json";

const HEALTH_MESSAGES: Record<Locale, typeof zhMessages> = {
  zh: zhMessages,
  en: enMessages,
};

/**
 * Pure helper used by tests; defaults to zh so existing callers keep their
 * behaviour.
 */
export function createHealthResponse(
  nowFactory: () => Date = () => new Date(),
  locale: Locale = "zh",
): Response {
  try {
    return Response.json({ status: "ok", timestamp: nowFactory().toISOString() });
  } catch (error) {
    logger.error("[api/health] Unexpected GET error", error);
    const t = createTranslator({
      locale,
      namespace: "errors.api",
      messages: HEALTH_MESSAGES[locale],
    });
    return Response.json({ error: t("internal") }, { status: 500 });
  }
}

export async function GET() {
  return createHealthResponse();
}
