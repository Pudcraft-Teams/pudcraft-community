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

interface RegisterFieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  code?: string;
}

const stepOneSchema = z
  .object({
    email: z
      .string()
      .email("请输入有效邮箱")
      .transform((value) => value.toLowerCase().trim()),
    password: z.string().min(8, "密码至少 8 位"),
    confirmPassword: z.string().min(1, "请再次输入密码"),
  })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "两次输入的密码不一致",
        path: ["confirmPassword"],
      });
    }
  });

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "验证码必须是 6 位数字"),
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
 * 注册页面。
 * 两步式流程：先发送验证码，再提交验证码完成注册。
 */
export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});

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
    const parsed = stepOneSchema.safeParse({ email, password, confirmPassword });
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: errors.email?.[0],
        password: errors.password?.[0],
        confirmPassword: errors.confirmPassword?.[0],
      });
      toast.error("请检查邮箱和密码输入");
      return;
    }

    setIsSendingCode(true);
    try {
      const response = await fetch("/api/auth/send-code", {
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
      toast.success(payload.message ?? "验证码已发送，请查收邮箱");
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isRegistering) {
      return;
    }

    setFieldErrors((prev) => ({ ...prev, code: undefined }));
    const parsedCode = codeSchema.safeParse({ code });
    if (!parsedCode.success) {
      setFieldErrors((prev) => ({
        ...prev,
        code: parsedCode.error.flatten().fieldErrors.code?.[0],
      }));
      toast.error("验证码格式不正确");
      return;
    }

    setIsRegistering(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          code: parsedCode.data.code,
        }),
      });

      const payload = toApiPayload(await response.json().catch(() => ({})));
      if (!response.ok) {
        toast.error(payload.error ?? "注册失败，请稍后再试");
        return;
      }

      router.push("/login?registered=true");
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleResendCode = async () => {
    if (isSendingCode || cooldown > 0) {
      return;
    }

    setIsSendingCode(true);

    try {
      const response = await fetch("/api/auth/send-code", {
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
      toast.success(payload.message ?? "验证码已重新发送，请查收邮箱");
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
        <h1 className="text-2xl font-semibold text-slate-900">注册 PudCraft 账号</h1>
        <p className="mt-2 text-sm text-slate-600">
          {step === 1 ? "填写邮箱和密码后获取验证码" : "输入邮箱验证码完成注册"}
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

              <label className="block text-sm text-slate-700">
                密码
                <div className="relative mt-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="m3-input w-full pr-16"
                    placeholder="至少 8 位"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  >
                    {showPassword ? "隐藏" : "显示"}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="mt-1 text-xs text-red-400">{fieldErrors.password}</p>
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
                    placeholder="再次输入密码"
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
          <form className="mt-5 space-y-4" onSubmit={handleRegister} noValidate>
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              验证码已发送到 <span className="font-medium text-slate-900">{email}</span>
            </p>

            <fieldset
              disabled={isRegistering || isSendingCode}
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

              <button
                type="submit"
                disabled={isRegistering}
                className="m3-btn m3-btn-primary w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRegistering ? "注册中..." : "注册"}
              </button>

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
            </fieldset>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-600">
          已有账号？
          <Link href="/login" className="m3-link ml-1">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
