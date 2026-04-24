"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface CopyIdBadgeProps {
  label: string;
  value: string;
}

/**
 * 数字 ID 展示 + 一键复制 badge。
 * 用于展示 PSID / UID 并支持复制。
 */
export function CopyIdBadge({ label, value }: CopyIdBadgeProps) {
  const t = useTranslations("servers.common");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        return;
      } catch {
        // fallback
      }
    }

    if (typeof window !== "undefined") {
      window.prompt(t("copyManualPrompt"), value);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-full bg-coral-light px-2.5 py-1 text-xs font-medium text-coral ring-1 ring-coral-light transition-colors hover:bg-coral-light/80"
      title={t("copyIdTitle", { label })}
    >
      <span>
        {label}: {value}
      </span>
      <span className="text-coral">{copied ? "✓" : "⎘"}</span>
    </button>
  );
}
