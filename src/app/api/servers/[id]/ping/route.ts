export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { logger } from "@/lib/logger";
import { serverLookupIdSchema } from "@/lib/validation";

/**
 * GET /api/servers/:id/ping
 * 轻量端点，供前端测量往返延迟用。
 * 不查数据库，只做 ID 格式校验后立即返回。
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    const { id } = await params;
    const parsed = serverLookupIdSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: tServers("invalidId") }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[api/servers/[id]/ping] Unexpected GET error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
