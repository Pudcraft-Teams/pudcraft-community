import nodemailer from "nodemailer";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const verificationEmailSchema = z.string().trim().email();
const verificationCodeSchema = z.string().regex(/^\d{6}$/, "验证码必须是 6 位数字");

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: true,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

/**
 * 发送邮箱验证码邮件。
 *
 * @param email - 收件人邮箱
 * @param code - 6 位验证码
 */
export async function sendVerificationCode(email: string, code: string): Promise<void> {
  const validatedEmail = verificationEmailSchema.parse(email);
  const validatedCode = verificationCodeSchema.parse(code);

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: validatedEmail,
    subject: "PudCraft 邮箱验证码",
    text: `你的验证码是 ${validatedCode}，10 分钟内有效。`,
    html: `
      <div style="background:#030712;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#d1d5db;">
        <div style="max-width:520px;margin:0 auto;border:1px solid #1f2937;background:#111827;border-radius:12px;overflow:hidden;">
          <div style="padding:20px 24px;border-bottom:1px solid #1f2937;">
            <h1 style="margin:0;font-size:18px;color:#34d399;">PudCraft 邮箱验证</h1>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 12px 0;line-height:1.7;color:#d1d5db;">你好，你正在进行邮箱验证。</p>
            <p style="margin:0 0 16px 0;line-height:1.7;color:#d1d5db;">请在页面中输入以下 6 位验证码：</p>
            <div style="display:inline-block;padding:12px 16px;border-radius:8px;border:1px solid #374151;background:#030712;font-size:28px;letter-spacing:6px;font-weight:700;color:#34d399;">
              ${validatedCode}
            </div>
            <p style="margin:16px 0 0 0;line-height:1.7;color:#9ca3af;">验证码 10 分钟内有效，请勿泄露给他人。</p>
          </div>
        </div>
      </div>
    `,
  });

  logger.info("[mail] Verification code email sent", { email: validatedEmail });
}

/**
 * 发送重置密码验证码邮件。
 *
 * @param email - 收件人邮箱
 * @param code - 6 位验证码
 */
export async function sendResetPasswordCode(email: string, code: string): Promise<void> {
  const validatedEmail = verificationEmailSchema.parse(email);
  const validatedCode = verificationCodeSchema.parse(code);

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: validatedEmail,
    subject: "PudCraft 密码重置验证码",
    text: `你正在重置 PudCraft 账号密码，验证码为 ${validatedCode}，10 分钟内有效。如果这不是你的操作，请忽略此邮件。`,
    html: `
      <div style="background:#030712;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#d1d5db;">
        <div style="max-width:520px;margin:0 auto;border:1px solid #1f2937;background:#111827;border-radius:12px;overflow:hidden;">
          <div style="padding:20px 24px;border-bottom:1px solid #1f2937;">
            <h1 style="margin:0;font-size:18px;color:#34d399;">PudCraft 密码重置</h1>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 12px 0;line-height:1.7;color:#d1d5db;">你正在重置 PudCraft 账号密码。</p>
            <p style="margin:0 0 16px 0;line-height:1.7;color:#d1d5db;">请在页面中输入以下 6 位验证码：</p>
            <div style="display:inline-block;padding:12px 16px;border-radius:8px;border:1px solid #374151;background:#030712;font-size:28px;letter-spacing:6px;font-weight:700;color:#34d399;">
              ${validatedCode}
            </div>
            <p style="margin:16px 0 0 0;line-height:1.7;color:#9ca3af;">验证码 10 分钟内有效。如果这不是你的操作，请忽略此邮件。</p>
          </div>
        </div>
      </div>
    `,
  });

  logger.info("[mail] Reset password code email sent", { email: validatedEmail });
}
