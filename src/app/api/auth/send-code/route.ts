export const dynamic = "force-dynamic";

import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { getRequestLocale } from "@/i18n/locale";
import { logger } from "@/lib/logger";
import { sendVerificationCode } from "@/lib/mail";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit } from "@/lib/rate-limit";
import { sendCodeSchema } from "@/lib/validation";
import { canSendCode, generateCode, setSendCooldown, storeCode } from "@/lib/verification";

/**
 * POST /api/auth/send-code
 * 发送邮箱验证码。
 */
export async function POST(request: Request) {
  const locale = await getRequestLocale(request);
  const t = await getTranslations({ locale, namespace: "errors.api.auth" });
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
    }

    const parsed = sendCodeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: t("validationFailed"), details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const email = parsed.data.email;
    const ip = getClientIp(request);

    const sendAllowed = await canSendCode(email);
    if (!sendAllowed) {
      return NextResponse.json({ error: t("sendCooldown") }, { status: 429 });
    }

    const ipRate = await rateLimit(`send-code:${ip}`, 10, 24 * 60 * 60);
    if (!ipRate.allowed) {
      return NextResponse.json({ error: t("ipDailyLimit") }, { status: 429 });
    }

    const code = generateCode();
    await storeCode(email, code);
    await sendVerificationCode(email, code);
    await setSendCooldown(email);

    return NextResponse.json({ success: true, message: t("codeSent") });
  } catch (err) {
    logger.error("[api/auth/send-code] Unexpected error", err);
    return NextResponse.json({ error: t("internal") }, { status: 500 });
  }
}
