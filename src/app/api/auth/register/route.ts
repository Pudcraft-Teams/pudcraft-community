export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getRequestLocale } from "@/i18n/locale";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateAndReserveUid } from "@/lib/numeric-id";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";
import { isLocked, verifyCode } from "@/lib/verification";

/**
 * POST /api/auth/register
 * 邮箱 + 密码 + 验证码注册。
 */
export async function POST(request: Request) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tAuth = await getTranslations({ locale, namespace: "errors.api.auth" });
  try {
    const clientIp = getClientIp(request);
    const registerRate = await rateLimit(`register:${clientIp}`, 10, 24 * 60 * 60);
    if (!registerRate.allowed) {
      return NextResponse.json({ error: tAuth("registerRateLimited") }, { status: 429 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: tCommon("invalidJson") }, { status: 400 });
    }

    const parsed = registerSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { email, password, code } = parsed.data;

    const exists = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json({ error: tAuth("registerConflict") }, { status: 409 });
    }

    const locked = await isLocked(email);
    if (locked) {
      return NextResponse.json({ error: tAuth("codeTooManyAttempts") }, { status: 429 });
    }

    const codeValid = await verifyCode(email, code);
    if (!codeValid) {
      return NextResponse.json({ error: tAuth("codeInvalidOrExpired") }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      await db.$transaction(async (tx) => {
        const uid = await generateAndReserveUid(tx);
        await tx.user.create({
          data: {
            email,
            passwordHash,
            emailVerified: new Date(),
            uid,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: tAuth("registerConflict") }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, message: tAuth("registerSuccess") });
  } catch (err) {
    logger.error("[api/auth/register] Unexpected error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
