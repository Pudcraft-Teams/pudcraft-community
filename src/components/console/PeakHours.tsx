"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ConsoleHourlyAveragePoint } from "@/components/console/types";

interface PeakHoursProps {
  hourlyAverages: ConsoleHourlyAveragePoint[];
  isLoading?: boolean;
}

function resolveRangeLabel(hourLabel: string): string {
  const hour = Number.parseInt(hourLabel.slice(0, 2), 10);
  if (!Number.isFinite(hour)) {
    return `${hourLabel}-??:00`;
  }

  const nextHour = (hour + 1) % 24;
  return `${String(hour).padStart(2, "0")}:00-${String(nextHour).padStart(2, "0")}:00`;
}

/**
 * 流量高峰时段分析。
 * 基于小时平均在线人数给出 Top 3，并提供 24 小时分布图。
 */
export function PeakHours({ hourlyAverages, isLoading = false }: PeakHoursProps) {
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
      <h2 className="text-lg font-semibold text-slate-900">流量高峰时段</h2>

      {isLoading ? (
        <div className="mt-4 text-sm text-slate-500">分析中...</div>
      ) : !hasData ? (
        <div className="mt-4 text-sm text-slate-500">近 7 天数据不足，暂时无法分析高峰时段。</div>
      ) : (
        <>
          <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            {peakHours.map((item, index) => (
              <div key={item.hour} className="flex items-center justify-between gap-3 text-sm">
                <p className="text-slate-700">
                  <span className={index < 2 ? "text-rose-500" : "text-slate-400"}>🔥</span>{" "}
                  {resolveRangeLabel(item.hour)}
                </p>
                <p className="text-slate-500">平均 {item.avgPlayers} 人</p>
              </div>
            ))}
          </div>

          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyAverages} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                  interval={1}
                  tickFormatter={(value: string) => value.slice(0, 2)}
                />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    borderColor: "#e2e8f0",
                    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
                  }}
                  cursor={{ fill: "rgba(148, 163, 184, 0.16)" }}
                />
                <Bar dataKey="avgPlayers" name="在线人数" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
