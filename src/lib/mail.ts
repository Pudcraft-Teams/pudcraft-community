import nodemailer from "nodemailer";
import { createTranslator } from "next-intl";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSmtpEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import zhMessages from "../../messages/zh.json";
import enMessages from "../../messages/en.json";

const verificationEmailSchema = z.string().trim().email();
const verificationCodeSchema = z.string().regex(/^\d{6}$/, "verification code must be 6 digits");

const messagesByLocale: Record<Locale, typeof zhMessages> = {
  zh: zhMessages,
  en: enMessages,
};

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    const env = getSmtpEnv();
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return _transporter;
}

/**
 * Escape a string for safe interpolation into an HTML template.
 * Translations are user-controlled (via the messages JSON) but they go
 * through this helper as a defense-in-depth guarantee.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Resolve the recipient's preferred locale for outbound mail.
 *
 * Order:
 *   1. explicit override (unauth flows pass the request locale here)
 *   2. User.locale column looked up by email (authenticated recipients)
 *   3. defaultLocale fallback
 */
export async function resolveMailLocale(
  recipientEmail: string,
  override?: Locale,
): Promise<Locale> {
  if (override && isLocale(override)) {
    return override;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { email: recipientEmail },
      select: { locale: true },
    });
    if (user?.locale && isLocale(user.locale)) {
      return user.locale;
    }
  } catch (err) {
    logger.warn("[mail] Failed to look up recipient locale, falling back to default", err);
  }
  return defaultLocale;
}

function renderVerifyCodeEmail(locale: Locale, code: string): {
  subject: string;
  text: string;
  html: string;
} {
  const t = createTranslator({
    locale,
    namespace: "email.verifyCode",
    messages: messagesByLocale[locale],
  });
  const subject = t("subject");
  const text = t("textBody", { code });
  const html = `
      <div style="background:#030712;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#d1d5db;">
        <div style="max-width:520px;margin:0 auto;border:1px solid #1f2937;background:#111827;border-radius:12px;overflow:hidden;">
          <div style="padding:20px 24px;border-bottom:1px solid #1f2937;">
            <h1 style="margin:0;font-size:18px;color:#34d399;">${escapeHtml(t("heading"))}</h1>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 12px 0;line-height:1.7;color:#d1d5db;">${escapeHtml(t("greeting"))}</p>
            <p style="margin:0 0 16px 0;line-height:1.7;color:#d1d5db;">${escapeHtml(t("instruction"))}</p>
            <div style="display:inline-block;padding:12px 16px;border-radius:8px;border:1px solid #374151;background:#030712;font-size:28px;letter-spacing:6px;font-weight:700;color:#34d399;">
              ${escapeHtml(code)}
            </div>
            <p style="margin:16px 0 0 0;line-height:1.7;color:#9ca3af;">${escapeHtml(t("validity"))}</p>
          </div>
        </div>
      </div>
    `;
  return { subject, text, html };
}

function renderResetPasswordEmail(locale: Locale, code: string): {
  subject: string;
  text: string;
  html: string;
} {
  const t = createTranslator({
    locale,
    namespace: "email.resetPassword",
    messages: messagesByLocale[locale],
  });
  const subject = t("subject");
  const text = t("textBody", { code });
  const html = `
      <div style="background:#030712;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#d1d5db;">
        <div style="max-width:520px;margin:0 auto;border:1px solid #1f2937;background:#111827;border-radius:12px;overflow:hidden;">
          <div style="padding:20px 24px;border-bottom:1px solid #1f2937;">
            <h1 style="margin:0;font-size:18px;color:#34d399;">${escapeHtml(t("heading"))}</h1>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 12px 0;line-height:1.7;color:#d1d5db;">${escapeHtml(t("greeting"))}</p>
            <p style="margin:0 0 16px 0;line-height:1.7;color:#d1d5db;">${escapeHtml(t("instruction"))}</p>
            <div style="display:inline-block;padding:12px 16px;border-radius:8px;border:1px solid #374151;background:#030712;font-size:28px;letter-spacing:6px;font-weight:700;color:#34d399;">
              ${escapeHtml(code)}
            </div>
            <p style="margin:16px 0 0 0;line-height:1.7;color:#9ca3af;">${escapeHtml(t("validity"))}</p>
          </div>
        </div>
      </div>
    `;
  return { subject, text, html };
}

/**
 * Send the email verification code.
 *
 * @param email - recipient email address
 * @param code - 6-digit verification code
 * @param localeOverride - request-scoped locale (unauth flows should pass this;
 *   authenticated flows may omit and let `User.locale` resolve)
 */
export async function sendVerificationCode(
  email: string,
  code: string,
  localeOverride?: Locale,
): Promise<void> {
  const validatedEmail = verificationEmailSchema.parse(email);
  const validatedCode = verificationCodeSchema.parse(code);
  const locale = await resolveMailLocale(validatedEmail, localeOverride);
  const { subject, text, html } = renderVerifyCodeEmail(locale, validatedCode);

  await getTransporter().sendMail({
    from: getSmtpEnv().SMTP_FROM,
    to: validatedEmail,
    subject,
    text,
    html,
  });

  logger.info("[mail] Verification code email sent", { email: validatedEmail, locale });
}

/**
 * Send the password reset verification code.
 *
 * @param email - recipient email address
 * @param code - 6-digit verification code
 * @param localeOverride - request-scoped locale (unauth flows should pass this)
 */
export async function sendResetPasswordCode(
  email: string,
  code: string,
  localeOverride?: Locale,
): Promise<void> {
  const validatedEmail = verificationEmailSchema.parse(email);
  const validatedCode = verificationCodeSchema.parse(code);
  const locale = await resolveMailLocale(validatedEmail, localeOverride);
  const { subject, text, html } = renderResetPasswordEmail(locale, validatedCode);

  await getTransporter().sendMail({
    from: getSmtpEnv().SMTP_FROM,
    to: validatedEmail,
    subject,
    text,
    html,
  });

  logger.info("[mail] Reset password code email sent", { email: validatedEmail, locale });
}
