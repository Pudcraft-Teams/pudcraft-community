export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";
import { isLocked, verifyCode } from "@/lib/verification";

/**
 * POST /api/auth/register
 * 邮箱 + 密码 + 验证码注册。
 */
export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const registerRate = await rateLimit(`register:${clientIp}`, 10, 24 * 60 * 60);
    if (!registerRate.allowed) {
      return NextResponse.json({ error: "今日注册请求次数已达上限，请明天再试" }, { status: 429 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 });
    }

    const parsed = registerSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { email, password, code } = parsed.data;

    const exists = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json({ error: "注册失败，请重试" }, { status: 409 });
    }

    const locked = await isLocked(email);
    if (locked) {
      return NextResponse.json({ error: "验证码错误次数过多，请稍后再试" }, { status: 429 });
    }

    const codeValid = await verifyCode(email, code);
    if (!codeValid) {
      return NextResponse.json({ error: "验证码错误或已过期" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      await db.user.create({
        data: {
          email,
          passwordHash,
          emailVerified: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "注册失败，请重试" }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, message: "注册成功" });
  } catch (err) {
    logger.error("[api/auth/register] Unexpected error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
