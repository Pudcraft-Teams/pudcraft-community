"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ConsoleStatsDataPoint,
  ConsoleStatsSummary,
  StatsPeriod,
} from "@/components/console/types";

// Recharts requires literal color strings; these match design tokens
const CHART_GRID = "#E8DDD4"; // warm-200
const CHART_TICK = "#8B7355"; // ~warm-600
const CHART_PRIMARY = "#D4715E"; // coral
const CHART_MUTED = "#B8A99A"; // ~warm-300

interface PlayerChartProps {
  dataPoints: ConsoleStatsDataPoint[];
  period: StatsPeriod;
  summary: ConsoleStatsSummary;
  isLoading?: boolean;
  onPeriodChange: (period: StatsPeriod) => void;
}

interface ChartPoint extends ConsoleStatsDataPoint {
  onlinePlayerCount: number | null;
  offlinePlayerCount: number | null;
}

const PERIOD_OPTIONS: Array<{ key: StatsPeriod; label: string }> = [
  { key: "24h", label: "24小时" },
  { key: "7d", label: "7天" },
  { key: "30d", label: "30天" },
];

function renderTooltip({ active, label, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const maybePoint = payload[0]?.payload;
  if (typeof maybePoint !== "object" || maybePoint === null) {
    return null;
  }

  const rawPoint = maybePoint as Partial<ChartPoint>;
  const playerCount = typeof rawPoint.playerCount === "number" ? rawPoint.playerCount : 0;
  const maxPlayers = typeof rawPoint.maxPlayers === "number" ? rawPoint.maxPlayers : 0;
  const isOnline = rawPoint.isOnline === true;
  const labelText = typeof label === "string" || typeof label === "number" ? String(label) : "--";

  return (
    <div className="rounded-xl border border-warm-200 bg-surface px-3 py-2 text-xs text-warm-800 shadow-lg">
      <p className="font-medium text-warm-800">{labelText}</p>
      <p className="mt-1">在线人数：{playerCount}</p>
      <p>最大容量：{maxPlayers}</p>
      <p className={isOnline ? "text-forest" : "text-warm-500"}>
        状态：{isOnline ? "在线" : "离线"}
      </p>
    </div>
  );
}

/**
 * 在线人数趋势图。
 * 支持 24h/7d/30d 切换，并对离线时段使用灰色虚线展示。
 */
export function PlayerChart({
  dataPoints,
  period,
  summary,
  isLoading = false,
  onPeriodChange,
}: PlayerChartProps) {
  const chartData: ChartPoint[] = dataPoints.map((point) => ({
    ...point,
    onlinePlayerCount: point.isOnline ? point.playerCount : null,
    offlinePlayerCount: point.isOnline ? null : point.playerCount,
  }));

  const noData = summary.totalChecks === 0;

  return (
    <section className="m3-surface p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-warm-800">在线人数趋势</h2>
        <div className="flex items-center gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`m3-btn px-3 py-1.5 text-xs ${
                period === option.key ? "m3-btn-primary" : "m3-btn-tonal"
              }`}
              onClick={() => {
                onPeriodChange(option.key);
              }}
              disabled={isLoading}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-[300px] items-center justify-center text-sm text-warm-500">
          加载统计中...
        </div>
      ) : noData ? (
        <div className="flex h-[300px] items-center justify-center text-sm text-warm-500">
          数据收集中，稍后再来查看趋势。
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="onlineArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_PRIMARY} stopOpacity={0.32} />
                <stop offset="95%" stopColor={CHART_PRIMARY} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 12, fill: CHART_TICK }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: CHART_TICK }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={36}
            />
            <Tooltip content={renderTooltip} />
            <Area
              type="monotone"
              dataKey="onlinePlayerCount"
              stroke={CHART_PRIMARY}
              fill="url(#onlineArea)"
              strokeWidth={2}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="offlinePlayerCount"
              stroke={CHART_MUTED}
              strokeDasharray="5 4"
              fillOpacity={0}
              strokeWidth={2}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
