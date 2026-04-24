"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useToast } from "@/hooks/useToast";

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

/**
 * 登录页面。
 * 使用 NextAuth Credentials 登录，成功后跳转首页。
 */
export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("auth.login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("/");

  const loginFormSchema = z.object({
    email: z
      .string()
      .email(t("errors.invalidEmail"))
      .transform((value) => value.toLowerCase().trim()),
    password: z.string().min(1, t("errors.passwordRequired")),
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const registered = params.get("registered");
    const reset = params.get("reset");
    const callback = params.get("callbackUrl");

    if (registered === "true") {
      toast.success(t("toasts.registered"));
    }
    if (reset === "true") {
      toast.success(t("toasts.reset"));
    }

    if (callback && callback.startsWith("/") && !callback.startsWith("//")) {
      setCallbackUrl(callback);
    }
  }, [toast, t]);

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
      toast.error(t("errors.formInvalid"));
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
          toast.error(t("errors.banned"));
          return;
        }
        toast.error(t("errors.credentials"));
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = "m3-input mt-2 w-full";

  return (
    <div className="mx-auto w-full max-w-md px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-warm-800">{t("title")}</h1>
        <p className="mt-2 text-sm text-warm-600">{t("subtitle")}</p>

        <form className="mt-5 space-y-4" onSubmit={handleLogin} noValidate>
          <fieldset disabled={isSubmitting} className="space-y-4 disabled:opacity-90">
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

            <label className="block text-sm text-warm-700">
              {t("passwordLabel")}
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-warm-500 hover:bg-warm-100 hover:text-warm-700"
                >
                  {showPassword ? t("hidePassword") : t("showPassword")}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-coral-hover">{fieldErrors.password}</p>
              )}
            </label>
          </fieldset>

          <div className="-mt-2 text-right">
            <Link href="/forgot-password" className="m3-link text-xs">
              {t("forgotLink")}
            </Link>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="m3-btn m3-btn-primary w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? t("submitting") : t("submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-warm-600">
          {t("noAccount")}
          <Link href="/register" className="m3-link ml-1">
            {t("registerLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
