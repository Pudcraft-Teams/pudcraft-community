import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { sendVerificationCode } from "@/lib/mail";
import { sendCodeSchema } from "@/lib/validation";
import {
  canSendCode,
  checkIpLimit,
  generateCode,
  setSendCooldown,
  storeCode,
} from "@/lib/verification";

/**
 * POST /api/auth/send-code
 * 发送邮箱验证码。
 */
export async function POST(request: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 });
    }

    const parsed = sendCodeSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const email = parsed.data.email;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const sendAllowed = await canSendCode(email);
    if (!sendAllowed) {
      return NextResponse.json({ error: "发送过于频繁，请 60 秒后再试" }, { status: 429 });
    }

    const ipAllowed = await checkIpLimit(ip);
    if (!ipAllowed) {
      return NextResponse.json({ error: "当前 IP 今日发送次数已达上限" }, { status: 429 });
    }

    const code = generateCode();
    await storeCode(email, code);
    await sendVerificationCode(email, code);
    await setSendCooldown(email);

    return NextResponse.json({ success: true, message: "验证码已发送" });
  } catch (err) {
    logger.error("[api/auth/send-code] Unexpected error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
