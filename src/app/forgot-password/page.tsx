"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useToast } from "@/hooks/useToast";

interface ApiResponsePayload {
  error?: string;
  message?: string;
}

interface ForgotPasswordFieldErrors {
  email?: string;
  code?: string;
  newPassword?: string;
  confirmPassword?: string;
}

function toApiPayload(raw: unknown): ApiResponsePayload {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    error: typeof payload.error === "string" ? payload.error : undefined,
    message: typeof payload.message === "string" ? payload.message : undefined,
  };
}

/**
 * 忘记密码页面。
 * 两步式流程：先发送验证码，再输入验证码与新密码完成重置。
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("auth.forgot");
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ForgotPasswordFieldErrors>({});

  const emailSchema = z.object({
    email: z
      .string()
      .email(t("errors.invalidEmail"))
      .transform((value) => value.toLowerCase().trim()),
  });

  const resetSchema = z
    .object({
      code: z.string().regex(/^\d{6}$/, t("errors.codeFormat")),
      newPassword: z.string().min(8, t("errors.passwordMin")),
      confirmPassword: z.string().min(1, t("errors.confirmPasswordRequired")),
    })
    .superRefine(({ newPassword, confirmPassword }, ctx) => {
      if (newPassword !== confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t("errors.passwordMismatch"),
          path: ["confirmPassword"],
        });
      }
    });

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleSendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSendingCode) {
      return;
    }

    setFieldErrors({});
    const parsed = emailSchema.safeParse({ email });
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({ email: errors.email?.[0] });
      toast.error(t("errors.invalidEmail"));
      return;
    }

    setIsSendingCode(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parsed.data.email }),
      });

      const payload = toApiPayload(await response.json().catch(() => ({})));
      if (!response.ok) {
        toast.error(payload.error ?? t("errors.sendFailed"));
        return;
      }

      setEmail(parsed.data.email);
      setStep(2);
      setCooldown(60);
      toast.success(payload.message ?? t("toasts.codeSentIfRegistered"));
    } catch {
      toast.error(t("errors.network"));
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isResetting) {
      return;
    }

    setFieldErrors((prev) => ({
      ...prev,
      code: undefined,
      newPassword: undefined,
      confirmPassword: undefined,
    }));
    const parsed = resetSchema.safeParse({ code, newPassword, confirmPassword });
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors((prev) => ({
        ...prev,
        code: errors.code?.[0],
        newPassword: errors.newPassword?.[0],
        confirmPassword: errors.confirmPassword?.[0],
      }));
      toast.error(t("errors.resetFormInvalid"));
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: parsed.data.code,
          newPassword: parsed.data.newPassword,
        }),
      });

      const payload = toApiPayload(await response.json().catch(() => ({})));
      if (!response.ok) {
        toast.error(payload.error ?? t("errors.submitFailed"));
        return;
      }

      router.push("/login?reset=true");
    } catch {
      toast.error(t("errors.network"));
    } finally {
      setIsResetting(false);
    }
  };

  const handleResendCode = async () => {
    if (isSendingCode || cooldown > 0) {
      return;
    }

    setIsSendingCode(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = toApiPayload(await response.json().catch(() => ({})));
      if (!response.ok) {
        toast.error(payload.error ?? t("errors.sendFailed"));
        return;
      }

      setCooldown(60);
      toast.success(payload.message ?? t("toasts.codeSentIfRegistered"));
    } catch {
      toast.error(t("errors.network"));
    } finally {
      setIsSendingCode(false);
    }
  };

  const inputClass = "m3-input mt-2 w-full";

  return (
    <div className="mx-auto w-full max-w-md px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-warm-800">
          {step === 1 ? t("titleStepOne") : t("titleStepTwo")}
        </h1>
        <p className="mt-2 text-sm text-warm-600">
          {step === 1 ? t("subtitleStepOne") : t("subtitleStepTwo", { email })}
        </p>

        {step === 1 ? (
          <form className="mt-5 space-y-4" onSubmit={handleSendCode} noValidate>
            <fieldset disabled={isSendingCode} className="space-y-4 disabled:opacity-90">
              <label className="block text-sm text-warm-700">
                {t("emailLabel")}
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                  placeholder={t("emailPlaceholder")}
                  autoComplete="email"
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-coral-hover">{fieldErrors.email}</p>
                )}
              </label>

              <button
                type="submit"
                disabled={isSendingCode}
                className="m3-btn m3-btn-primary w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSendingCode ? t("sendingCode") : t("sendCode")}
              </button>
            </fieldset>
          </form>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={handleResetPassword} noValidate>
            <fieldset
              disabled={isResetting || isSendingCode}
              className="space-y-4 disabled:opacity-90"
            >
              <label className="block text-sm text-warm-700">
                {t("codeLabel")}
                <input
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  className={inputClass}
                  maxLength={6}
                  placeholder={t("codePlaceholder")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                {fieldErrors.code && (
                  <p className="mt-1 text-xs text-coral-hover">{fieldErrors.code}</p>
                )}
              </label>

              <label className="block text-sm text-warm-700">
                {t("newPasswordLabel")}
                <div className="relative mt-2">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="m3-input w-full pr-16"
                    placeholder={t("newPasswordPlaceholder")}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-warm-500 hover:bg-warm-100 hover:text-warm-700"
                  >
                    {showNewPassword ? t("hidePassword") : t("showPassword")}
                  </button>
                </div>
                {fieldErrors.newPassword && (
                  <p className="mt-1 text-xs text-coral-hover">{fieldErrors.newPassword}</p>
                )}
              </label>

              <label className="block text-sm text-warm-700">
                {t("confirmPasswordLabel")}
                <div className="relative mt-2">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="m3-input w-full pr-16"
                    placeholder={t("confirmPasswordPlaceholder")}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-warm-500 hover:bg-warm-100 hover:text-warm-700"
                  >
                    {showConfirmPassword ? t("hidePassword") : t("showPassword")}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="mt-1 text-xs text-coral-hover">{fieldErrors.confirmPassword}</p>
                )}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={isSendingCode || cooldown > 0}
                  className="m3-btn m3-btn-tonal w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSendingCode
                    ? t("sendingCode")
                    : cooldown > 0
                      ? t("resendIn", { cooldown })
                      : t("resend")}
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="m3-btn m3-btn-primary w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isResetting ? t("submitting") : t("submit")}
                </button>
              </div>
            </fieldset>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-warm-600">
          {t("rememberPrompt")}
          <Link href="/login" className="m3-link ml-1">
            {t("loginLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
