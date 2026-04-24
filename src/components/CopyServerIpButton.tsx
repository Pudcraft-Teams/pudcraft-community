"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface CopyServerIpButtonProps {
  address: string;
}

/**
 * 一键复制服务器地址按钮。
 * 优先使用 Clipboard API，失败时降级为手动复制提示。
 */
export function CopyServerIpButton({ address }: CopyServerIpButtonProps) {
  const t = useTranslations("servers.common");
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const handleCopy = async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(address);
        setStatus("copied");
        return;
      } catch {
        // Ignore and fallback to manual copy prompt.
      }
    }

    if (typeof window !== "undefined") {
      window.prompt(t("copyManualPrompt"), address);
    }
    setStatus("manual");
  };

  const buttonText =
    status === "copied"
      ? t("copyIpSuccess")
      : status === "manual"
        ? t("copyIpManual")
        : t("copyIp");
  const buttonClass =
    status === "copied"
      ? "m3-btn-primary"
      : status === "manual"
        ? "m3-btn-tonal"
        : "m3-btn-primary";

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`m3-btn rounded-lg px-3 py-1.5 text-xs transition-all duration-200 ${buttonClass}`}
    >
      {buttonText}
    </button>
  );
}
