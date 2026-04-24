"use client";

import { useTranslations } from "next-intl";

interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
}

function resolveTrendStyle(trend: StatCardProps["trend"]): {
  icon: string;
  className: string;
} {
  if (trend === "up") {
    return { icon: "↑", className: "text-forest" };
  }

  if (trend === "down") {
    return { icon: "↓", className: "text-coral-hover" };
  }

  return { icon: "→", className: "text-warm-500" };
}

/**
 * Console stats card.
 * Displays a core metric with optional trend indicator and caption.
 */
export function StatCard({ label, value, subtext, trend = "neutral" }: StatCardProps) {
  const trendStyle = resolveTrendStyle(trend);
  const t = useTranslations("console.stats");

  return (
    <div className="m3-surface p-4">
      <p className="text-sm font-medium text-warm-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-warm-800">{value}</p>
      {(subtext || trend !== "neutral") && (
        <p className={`mt-2 flex items-center gap-1 text-xs ${trendStyle.className}`}>
          <span>{trendStyle.icon}</span>
          <span>{subtext ?? t("trendDefault")}</span>
        </p>
      )}
    </div>
  );
}
