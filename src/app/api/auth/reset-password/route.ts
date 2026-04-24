export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { getRequestLocale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { sendResetPasswordCode } from "@/lib/mail";
import { getClientIp } from "@/lib/request-ip";
import { resetPasswordSchema, sendResetCodeSchema } from "@/lib/validation";
import {
  canSendCode,
  checkIpLimit,
  generateCode,
  isLocked,
  setSendCooldown,
  storeCode,
  verifyCode,
} from "@/lib/verification";

const RESET_CODE_PREFIX = "reset";
const RESET_ATTEMPTS_PREFIX = "reset-attempts";

/**
 * POST /api/auth/reset-password
 * 发送重置密码验证码（防邮箱枚举：邮箱不存在时也返回成功）。
 */
export async function POST(request: Request) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tAuth = await getTranslations({ locale, namespace: "errors.api.auth" });
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: tCommon("invalidJson") }, { status: 400 });
    }

    const parsed = sendResetCodeSchema.safeParse(rawBody, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: tCommon("validationFailed"),
          details: flattenZodErrorWithLocale(parsed.error, locale),
        },
        { status: 400 },
      );
    }

    const { email } = parsed.data;

    const sendAllowed = await canSendCode(email, RESET_CODE_PREFIX);
    if (!sendAllowed) {
      return NextResponse.json({ error: tAuth("sendCooldown") }, { status: 429 });
    }

    const ip = getClientIp(request);
    const ipAllowed = await checkIpLimit(ip);
    if (!ipAllowed) {
      return NextResponse.json({ error: tAuth("ipDailyLimit") }, { status: 429 });
    }

    const code = generateCode();
    await storeCode(email, code, RESET_CODE_PREFIX);
    await setSendCooldown(email, RESET_CODE_PREFIX);

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (user) {
      try {
        await sendResetPasswordCode(email, code, locale);
      } catch (error) {
        logger.error("[api/auth/reset-password][POST] send mail failed", error);
      }
    }

    return NextResponse.json({
      success: true,
      message: tAuth("resetMailSent"),
    });
  } catch (err) {
    logger.error("[api/auth/reset-password][POST] Unexpected error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * PATCH /api/auth/reset-password
 * 使用邮箱 + 验证码重置密码。
 */
export async function PATCH(request: Request) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tAuth = await getTranslations({ locale, namespace: "errors.api.auth" });
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: tCommon("invalidJson") }, { status: 400 });
    }

    const parsed = resetPasswordSchema.safeParse(rawBody, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: tCommon("validationFailed"),
          details: flattenZodErrorWithLocale(parsed.error, locale),
        },
        { status: 400 },
      );
    }

    const { email, code, newPassword } = parsed.data;

    const locked = await isLocked(email, RESET_ATTEMPTS_PREFIX);
    if (locked) {
      return NextResponse.json({ error: tAuth("codeTooManyAttempts") }, { status: 429 });
    }

    const codeValid = await verifyCode(email, code, RESET_CODE_PREFIX);
    if (!codeValid) {
      return NextResponse.json({ error: tAuth("codeInvalidOrExpired") }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: tAuth("resetFailed") }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({ success: true, message: tAuth("resetSuccess") });
  } catch (err) {
    logger.error("[api/auth/reset-password][PATCH] Unexpected error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
