"use client";

import { useTranslations } from "next-intl";
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

const PERIOD_OPTION_KEYS = ["24h", "7d", "30d"] as const;

type PeriodTranslate = (
  key: "trendPeriod24h" | "trendPeriod7d" | "trendPeriod30d",
) => string;

function resolvePeriodLabel(period: StatsPeriod, t: PeriodTranslate): string {
  if (period === "24h") return t("trendPeriod24h");
  if (period === "7d") return t("trendPeriod7d");
  return t("trendPeriod30d");
}

function createTooltipRenderer(t: ReturnType<typeof useTranslations>) {
  return function renderTooltip(
    { active, label, payload }: TooltipContentProps<
      number | string | ReadonlyArray<number | string>,
      number | string
    >,
  ) {
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
        <p className="mt-1">{t("trendTooltipPlayers", { count: playerCount })}</p>
        <p>{t("trendTooltipMax", { count: maxPlayers })}</p>
        <p className={isOnline ? "text-forest" : "text-warm-500"}>
          {isOnline ? t("trendTooltipStatusOnline") : t("trendTooltipStatusOffline")}
        </p>
      </div>
    );
  };
}

/**
 * Online-player trend chart.
 * Supports 24h/7d/30d switching; offline slots render as a grey dashed line.
 */
export function PlayerChart({
  dataPoints,
  period,
  summary,
  isLoading = false,
  onPeriodChange,
}: PlayerChartProps) {
  const t = useTranslations("console.stats");
  const renderTooltip = createTooltipRenderer(t);
  const chartData: ChartPoint[] = dataPoints.map((point) => ({
    ...point,
    onlinePlayerCount: point.isOnline ? point.playerCount : null,
    offlinePlayerCount: point.isOnline ? null : point.playerCount,
  }));

  const noData = summary.totalChecks === 0;

  return (
    <section className="m3-surface p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-warm-800">{t("trendChartTitle")}</h2>
        <div className="flex items-center gap-2">
          {PERIOD_OPTION_KEYS.map((optionKey) => (
            <button
              key={optionKey}
              type="button"
              className={`m3-btn px-3 py-1.5 text-xs ${
                period === optionKey ? "m3-btn-primary" : "m3-btn-tonal"
              }`}
              onClick={() => {
                onPeriodChange(optionKey);
              }}
              disabled={isLoading}
            >
              {resolvePeriodLabel(optionKey, t)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-[300px] items-center justify-center text-sm text-warm-500">
          {t("trendChartLoading")}
        </div>
      ) : noData ? (
        <div className="flex h-[300px] items-center justify-center text-sm text-warm-500">
          {t("trendChartEmpty")}
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
