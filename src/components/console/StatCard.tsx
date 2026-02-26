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
    return { icon: "↑", className: "text-emerald-600" };
  }

  if (trend === "down") {
    return { icon: "↓", className: "text-rose-600" };
  }

  return { icon: "→", className: "text-slate-500" };
}

/**
 * 控制台统计卡片。
 * 展示核心指标值，并可选显示趋势和补充说明。
 */
export function StatCard({ label, value, subtext, trend = "neutral" }: StatCardProps) {
  const trendStyle = resolveTrendStyle(trend);

  return (
    <div className="m3-surface p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      {(subtext || trend !== "neutral") && (
        <p className={`mt-2 flex items-center gap-1 text-xs ${trendStyle.className}`}>
          <span>{trendStyle.icon}</span>
          <span>{subtext ?? "趋势稳定"}</span>
        </p>
      )}
    </div>
  );
}
