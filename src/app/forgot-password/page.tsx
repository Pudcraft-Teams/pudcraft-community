"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

const emailSchema = z.object({
  email: z
    .string()
    .email("请输入有效邮箱")
    .transform((value) => value.toLowerCase().trim()),
});

const resetSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, "验证码必须是 6 位数字"),
    newPassword: z.string().min(8, "密码至少 8 位"),
    confirmPassword: z.string().min(1, "请再次输入密码"),
  })
  .superRefine(({ newPassword, confirmPassword }, ctx) => {
    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "两次输入的密码不一致",
        path: ["confirmPassword"],
      });
    }
  });

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
      toast.error("请输入有效邮箱");
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
        toast.error(payload.error ?? "验证码发送失败，请稍后再试");
        return;
      }

      setEmail(parsed.data.email);
      setStep(2);
      setCooldown(60);
      toast.success(payload.message ?? "如果该邮箱已注册，验证码已发送");
    } catch {
      toast.error("网络异常，请稍后重试");
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
      toast.error("请检查验证码和密码输入");
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
        toast.error(payload.error ?? "密码重置失败，请稍后重试");
        return;
      }

      router.push("/login?reset=true");
    } catch {
      toast.error("网络异常，请稍后重试");
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
        toast.error(payload.error ?? "验证码发送失败，请稍后再试");
        return;
      }

      setCooldown(60);
      toast.success(payload.message ?? "如果该邮箱已注册，验证码已发送");
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsSendingCode(false);
    }
  };

  const inputClass = "m3-input mt-2 w-full";

  return (
    <div className="mx-auto w-full max-w-md px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          {step === 1 ? "找回密码" : "重置密码"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {step === 1
            ? "请输入你的注册邮箱，我们会发送验证码帮你重置密码。"
            : `验证码已发送到 ${email}`}
        </p>

        {step === 1 ? (
          <form className="mt-5 space-y-4" onSubmit={handleSendCode} noValidate>
            <fieldset disabled={isSendingCode} className="space-y-4 disabled:opacity-90">
              <label className="block text-sm text-slate-700">
                邮箱
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.email}</p>
                )}
              </label>

              <button
                type="submit"
                disabled={isSendingCode}
                className="m3-btn m3-btn-primary w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSendingCode ? "发送中..." : "发送验证码"}
              </button>
            </fieldset>
          </form>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={handleResetPassword} noValidate>
            <fieldset
              disabled={isResetting || isSendingCode}
              className="space-y-4 disabled:opacity-90"
            >
              <label className="block text-sm text-slate-700">
                验证码
                <input
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                  className={inputClass}
                  maxLength={6}
                  placeholder="请输入 6 位数字验证码"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                {fieldErrors.code && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.code}</p>
                )}
              </label>

              <label className="block text-sm text-slate-700">
                新密码
                <div className="relative mt-2">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="m3-input w-full pr-16"
                    placeholder="至少 8 位"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    {showNewPassword ? "隐藏" : "显示"}
                  </button>
                </div>
                {fieldErrors.newPassword && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.newPassword}</p>
                )}
              </label>

              <label className="block text-sm text-slate-700">
                确认密码
                <div className="relative mt-2">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="m3-input w-full pr-16"
                    placeholder="再次输入新密码"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    {showConfirmPassword ? "隐藏" : "显示"}
                  </button>
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.confirmPassword}</p>
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
                    ? "发送中..."
                    : cooldown > 0
                      ? `重新发送 (${cooldown}s)`
                      : "重新发送"}
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="m3-btn m3-btn-primary w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isResetting ? "重置中..." : "重置密码"}
                </button>
              </div>
            </fieldset>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-600">
          想起密码了？
          <Link href="/login" className="m3-link ml-1">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
