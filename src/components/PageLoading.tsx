"use client";

import { useTranslations } from "next-intl";
import { LoadingSpinner } from "@/components/LoadingSpinner";

interface PageLoadingProps {
  text?: string;
}

/**
 * Full-page loading indicator for page-level data loading.
 */
export function PageLoading({ text }: PageLoadingProps) {
  const t = useTranslations("common.loading");
  return (
    <div className="flex min-h-[240px] items-center justify-center">
      <LoadingSpinner size="lg" text={text ?? t("default")} />
    </div>
  );
}
