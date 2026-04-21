"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

function sizeClassMap(size: "sm" | "md" | "lg"): string {
  if (size === "sm") {
    return "h-4 w-4 border-2";
  }

  if (size === "lg") {
    return "h-10 w-10 border-[3px]";
  }

  return "h-6 w-6 border-2";
}

function textClassMap(size: "sm" | "md" | "lg"): string {
  if (size === "sm") {
    return "text-xs";
  }

  if (size === "lg") {
    return "text-base";
  }

  return "text-sm";
}

function renderText(text: string | undefined, size: "sm" | "md" | "lg"): ReactNode {
  if (!text) {
    return null;
  }

  return <span className={`text-warm-500 ${textClassMap(size)}`}>{text}</span>;
}

/**
 * Shared loading spinner.
 * Supports multiple sizes and an optional label; defaults to the Material 3
 * light style.
 */
export function LoadingSpinner({ size = "md", text, className = "" }: LoadingSpinnerProps) {
  const t = useTranslations("common.loading");
  return (
    <div className={`inline-flex items-center gap-2 ${className}`} role="status">
      <span
        aria-hidden="true"
        className={`animate-spin rounded-full border-accent border-t-transparent ${sizeClassMap(size)}`}
      />
      {renderText(text, size)}
      {!text && <span className="sr-only">{t("srLabel")}</span>}
    </div>
  );
}
