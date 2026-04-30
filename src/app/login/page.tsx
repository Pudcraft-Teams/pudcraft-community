import Link from "next/link";
import { getTranslations } from "next-intl/server";

interface LoginPageProps {
  searchParams: Promise<{
    error?: string;
    callbackUrl?: string;
  }>;
}

const ERROR_KEYS: Record<string, string> = {
  banned: "errors.banned",
  misskey_failed: "errors.misskeyFailed",
  misskey_unconfigured: "errors.misskeyUnconfigured",
  signin_failed: "errors.signinFailed",
};

function sanitizeCallbackUrl(raw: string | undefined): string {
  if (!raw) return "/";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(params.callbackUrl);
  const errorKey = params.error ? ERROR_KEYS[params.error] : null;

  const t = await getTranslations("auth.login");

  const startHref = `/api/auth/misskey/start?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return (
    <div className="mx-auto w-full max-w-md px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-warm-800">{t("title")}</h1>
        <p className="mt-2 text-sm text-warm-600">{t("subtitle")}</p>

        {errorKey && (
          <p className="mt-4 rounded-md border border-coral-hover/40 bg-coral-hover/10 px-3 py-2 text-sm text-coral-hover">
            {t(errorKey)}
          </p>
        )}

        <Link
          href={startHref}
          className="m3-btn m3-btn-primary mt-6 flex w-full items-center justify-center gap-2 py-3 text-base font-medium"
        >
          {t("loginWithMisskey")}
        </Link>

        <p className="mt-4 text-center text-xs text-warm-500">{t("misskeyNotice")}</p>
      </div>
    </div>
  );
}
