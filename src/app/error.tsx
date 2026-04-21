"use client";

import { useTranslations } from "next-intl";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error: _error, reset }: ErrorPageProps) {
  void _error;
  const t = useTranslations("errors.page");

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-warm-800">{t("title")}</h1>
      <p className="mt-3 text-sm text-warm-600">{t("description")}</p>
      <button type="button" onClick={reset} className="m3-btn m3-btn-primary mt-6">
        {t("retry")}
      </button>
    </div>
  );
}
