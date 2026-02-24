"use client";

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

  return <span className={`text-slate-600 ${textClassMap(size)}`}>{text}</span>;
}

/**
 * 通用加载指示器。
 * 支持尺寸和文案配置，默认 Material 3 浅色风格。
 */
export function LoadingSpinner({ size = "md", text, className = "" }: LoadingSpinnerProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className={`animate-spin rounded-full border-teal-500 border-t-transparent ${sizeClassMap(size)}`}
      />
      {renderText(text, size)}
    </div>
  );
}
