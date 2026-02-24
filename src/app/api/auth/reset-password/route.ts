import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendResetPasswordCode } from "@/lib/mail";
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
 * 提取请求来源 IP（用于发送限流）。
 *
 * @param request - HTTP 请求对象
 * @returns 客户端 IP 或兜底值 `unknown`
 */
function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * POST /api/auth/reset-password
 * 发送重置密码验证码（防邮箱枚举：邮箱不存在时也返回成功）。
 */
export async function POST(request: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 });
    }

    const parsed = sendResetCodeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { email } = parsed.data;
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({
        success: true,
        message: "如果该邮箱已注册，验证码已发送",
      });
    }

    const sendAllowed = await canSendCode(email, RESET_CODE_PREFIX);
    if (!sendAllowed) {
      return NextResponse.json({ error: "发送过于频繁，请 60 秒后再试" }, { status: 429 });
    }

    const ip = getClientIp(request);
    const ipAllowed = await checkIpLimit(ip);
    if (!ipAllowed) {
      return NextResponse.json({ error: "当前 IP 今日发送次数已达上限" }, { status: 429 });
    }

    const code = generateCode();
    await storeCode(email, code, RESET_CODE_PREFIX);
    await sendResetPasswordCode(email, code);
    await setSendCooldown(email, RESET_CODE_PREFIX);

    return NextResponse.json({
      success: true,
      message: "如果该邮箱已注册，验证码已发送",
    });
  } catch (err) {
    logger.error("[api/auth/reset-password][POST] Unexpected error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * PATCH /api/auth/reset-password
 * 使用邮箱 + 验证码重置密码。
 */
export async function PATCH(request: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 });
    }

    const parsed = resetPasswordSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { email, code, newPassword } = parsed.data;

    const locked = await isLocked(email, RESET_ATTEMPTS_PREFIX);
    if (locked) {
      return NextResponse.json({ error: "验证码错误次数过多，请稍后再试" }, { status: 429 });
    }

    const codeValid = await verifyCode(email, code, RESET_CODE_PREFIX);
    if (!codeValid) {
      return NextResponse.json({ error: "验证码错误或已过期" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "重置失败，请重试" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({ success: true, message: "密码已重置" });
  } catch (err) {
    logger.error("[api/auth/reset-password][PATCH] Unexpected error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
