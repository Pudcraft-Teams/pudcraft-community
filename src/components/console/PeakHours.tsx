"use client";

import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ConsoleHourlyAveragePoint } from "@/components/console/types";

// Recharts requires literal color strings; these match design tokens
const CHART_GRID = "#E8DDD4"; // warm-200
const CHART_TICK = "#8B7355"; // ~warm-600
const CHART_BORDER = "#E8DDD4"; // warm-200
const CHART_PRIMARY = "#D4715E"; // coral

interface PeakHoursProps {
  hourlyAverages: ConsoleHourlyAveragePoint[];
  isLoading?: boolean;
}

function resolveRangeLabel(
  hourLabel: string,
  t: ReturnType<typeof useTranslations>,
): string {
  const hour = Number.parseInt(hourLabel.slice(0, 2), 10);
  if (!Number.isFinite(hour)) {
    return t("peakRangeFallback", { label: hourLabel });
  }

  const nextHour = (hour + 1) % 24;
  return t("peakRangeLabel", {
    start: `${String(hour).padStart(2, "0")}:00`,
    end: `${String(nextHour).padStart(2, "0")}:00`,
  });
}

/**
 * Peak-hour analysis section.
 * Picks Top 3 hours by average online count and shows a 24h bar distribution.
 */
export function PeakHours({ hourlyAverages, isLoading = false }: PeakHoursProps) {
  const t = useTranslations("console.stats");
  const hasData = hourlyAverages.some((item) => item.sampleCount > 0);

  const peakHours = [...hourlyAverages]
    .filter((item) => item.sampleCount > 0)
    .sort((a, b) => {
      if (b.avgPlayers === a.avgPlayers) {
        return b.sampleCount - a.sampleCount;
      }
      return b.avgPlayers - a.avgPlayers;
    })
    .slice(0, 3);

  return (
    <section className="m3-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-warm-800">{t("peakTitle")}</h2>

      {isLoading ? (
        <div className="mt-4 text-sm text-warm-500">{t("peakLoading")}</div>
      ) : !hasData ? (
        <div className="mt-4 text-sm text-warm-500">{t("peakEmpty")}</div>
      ) : (
        <>
          <div className="mt-4 space-y-2 rounded-xl border border-warm-200 bg-warm-50 p-3">
            {peakHours.map((item, index) => (
              <div key={item.hour} className="flex items-center justify-between gap-3 text-sm">
                <p className="text-warm-800">
                  <span className={index < 2 ? "text-accent-hover" : "text-warm-400"}>🔥</span>{" "}
                  {resolveRangeLabel(item.hour, t)}
                </p>
                <p className="text-warm-500">{t("peakAverage", { count: item.avgPlayers })}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyAverages} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: CHART_TICK }}
                  tickLine={false}
                  axisLine={false}
                  interval={1}
                  tickFormatter={(value: string) => value.slice(0, 2)}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: CHART_TICK }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    borderColor: CHART_BORDER,
                    boxShadow: "0 8px 24px rgba(90, 60, 30, 0.08)",
                  }}
                  cursor={{ fill: "rgba(184, 169, 154, 0.16)" }}
                />
                <Bar dataKey="avgPlayers" name={t("trendSeriesName")} fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
