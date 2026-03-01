"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useToast } from "@/hooks/useToast";

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

const loginFormSchema = z.object({
  email: z
    .string()
    .email("请输入有效邮箱")
    .transform((value) => value.toLowerCase().trim()),
  password: z.string().min(1, "请输入密码"),
});

/**
 * 登录页面。
 * 使用 NextAuth Credentials 登录，成功后跳转首页。
 */
export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("/");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const registered = params.get("registered");
    const reset = params.get("reset");
    const callback = params.get("callbackUrl");

    if (registered === "true") {
      toast.success("注册成功，请登录");
    }
    if (reset === "true") {
      toast.success("密码已重置，请用新密码登录");
    }

    if (callback && callback.startsWith("/") && !callback.startsWith("//")) {
      setCallbackUrl(callback);
    }
  }, [toast]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setFieldErrors({});
    const parsed = loginFormSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: errors.email?.[0],
        password: errors.password?.[0],
      });
      toast.error("请检查邮箱和密码格式");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
        callbackUrl,
      });

      if (!result || result.error) {
        if (result?.code === "banned" || result?.error === "banned") {
          toast.error("账号已被封禁");
          return;
        }
        toast.error("邮箱或密码错误");
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      toast.error("登录失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "m3-input mt-2 w-full";

  return (
    <div className="mx-auto w-full max-w-md px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-slate-900">登录 PudCraft</h1>
        <p className="mt-2 text-sm text-slate-600">使用邮箱和密码登录你的账号</p>

        <form className="mt-5 space-y-4" onSubmit={handleLogin} noValidate>
          <fieldset disabled={isSubmitting} className="space-y-4 disabled:opacity-90">
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
                  autoComplete="current-password"
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
          </fieldset>

          <div className="-mt-2 text-right">
            <Link href="/forgot-password" className="m3-link text-xs">
              忘记密码？
            </Link>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="m3-btn m3-btn-primary w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "登录中..." : "登录"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          没有账号？
          <Link href="/register" className="m3-link ml-1">
            去注册
          </Link>
        </p>
      </div>
    </div>
  );
}
