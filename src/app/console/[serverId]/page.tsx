"use client";

import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PeakHours } from "@/components/console/PeakHours";
import { PlayerChart } from "@/components/console/PlayerChart";
import { RecentComments } from "@/components/console/RecentComments";
import { StatCard } from "@/components/console/StatCard";
import type {
  ConsoleHourlyAveragePoint,
  ConsoleStatsDataPoint,
  ConsoleStatsResponse,
  ConsoleStatsSummary,
  StatsPeriod,
} from "@/components/console/types";
import type { ServerDetail } from "@/lib/types";

interface ServerDetailPayload {
  data?: ServerDetail;
  error?: string;
}

interface StatsPayload {
  period?: StatsPeriod;
  dataPoints?: ConsoleStatsDataPoint[];
  summary?: ConsoleStatsSummary;
  hourlyAverages?: ConsoleHourlyAveragePoint[];
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStatsPeriod(value: unknown): value is StatsPeriod {
  return value === "24h" || value === "7d" || value === "30d";
}

function isStatsDataPoint(value: unknown): value is ConsoleStatsDataPoint {
  if (!isRecord(value)) return false;
  return (
    typeof value.time === "string" &&
    typeof value.playerCount === "number" &&
    typeof value.maxPlayers === "number" &&
    typeof value.isOnline === "boolean"
  );
}

function isStatsSummary(value: unknown): value is ConsoleStatsSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.avgPlayers === "number" &&
    typeof value.peakPlayers === "number" &&
    (typeof value.peakTime === "string" || value.peakTime === null) &&
    typeof value.uptimePercent === "number" &&
    typeof value.totalChecks === "number" &&
    typeof value.onlineChecks === "number"
  );
}

function isHourlyAveragePoint(value: unknown): value is ConsoleHourlyAveragePoint {
  if (!isRecord(value)) return false;
  return (
    typeof value.hour === "string" &&
    typeof value.avgPlayers === "number" &&
    typeof value.sampleCount === "number"
  );
}

function parseServerPayload(raw: unknown): ServerDetailPayload {
  if (!isRecord(raw)) return {};
  return {
    data: isRecord(raw.data) ? (raw.data as unknown as ServerDetail) : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

function parseStatsPayload(raw: unknown): StatsPayload {
  if (!isRecord(raw)) return {};
  return {
    period: isStatsPeriod(raw.period) ? raw.period : undefined,
    dataPoints: Array.isArray(raw.dataPoints) ? raw.dataPoints.filter(isStatsDataPoint) : undefined,
    summary: isStatsSummary(raw.summary) ? raw.summary : undefined,
    hourlyAverages: Array.isArray(raw.hourlyAverages)
      ? raw.hourlyAverages.filter(isHourlyAveragePoint)
      : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

export default function ConsoleOverviewPage() {
  const params = useParams<{ serverId: string }>();
  const { data: session, status } = useSession();
  const tStats = useTranslations("console.stats");
  const tPage = useTranslations("console.page");
  const [period, setPeriod] = useState<StatsPeriod>("24h");
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [stats, setStats] = useState<ConsoleStatsResponse | null>(null);
  const [peakHourly, setPeakHourly] = useState<ConsoleHourlyAveragePoint[]>([]);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [isPeakLoading, setIsPeakLoading] = useState(true);

  const serverId = params.serverId;

  const fetchServer = useCallback(async () => {
    try {
      const response = await fetch(`/api/servers/${serverId}`, { cache: "no-store" });
      const payload = parseServerPayload(await response.json().catch(() => ({})));
      if (response.ok && payload.data) {
        setServer(payload.data);
      }
    } catch {
      // layout handles auth errors; overview silently skips if server is unavailable
    }
  }, [serverId]);

  const fetchStats = useCallback(
    async (targetPeriod: StatsPeriod) => {
      setIsStatsLoading(true);
      try {
        const response = await fetch(`/api/servers/${serverId}/stats?period=${targetPeriod}`, {
          cache: "no-store",
        });
        const payload = parseStatsPayload(await response.json().catch(() => ({})));
        if (
          response.ok &&
          payload.period &&
          payload.dataPoints &&
          payload.summary &&
          payload.hourlyAverages
        ) {
          setStats({
            period: payload.period,
            dataPoints: payload.dataPoints,
            summary: payload.summary,
            hourlyAverages: payload.hourlyAverages,
          });
        }
      } catch {
        setStats(null);
      } finally {
        setIsStatsLoading(false);
      }
    },
    [serverId],
  );

  const fetchPeakHours = useCallback(async () => {
    setIsPeakLoading(true);
    try {
      const response = await fetch(`/api/servers/${serverId}/stats?period=7d`, {
        cache: "no-store",
      });
      const payload = parseStatsPayload(await response.json().catch(() => ({})));
      if (response.ok && payload.hourlyAverages) {
        setPeakHourly(payload.hourlyAverages);
      }
    } catch {
      setPeakHourly([]);
    } finally {
      setIsPeakLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void fetchServer();
    void fetchPeakHours();
  }, [fetchPeakHours, fetchServer, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void fetchStats(period);
  }, [fetchStats, period, status]);

  const summary = useMemo<ConsoleStatsSummary>(() => {
    return (
      stats?.summary ?? {
        avgPlayers: 0,
        peakPlayers: 0,
        peakTime: null,
        uptimePercent: 0,
        totalChecks: 0,
        onlineChecks: 0,
      }
    );
  }, [stats?.summary]);

  const playerTrend = useMemo<"up" | "down" | "neutral">(() => {
    if (!server) return "neutral";
    const currentPlayers = server.status.playerCount ?? 0;
    if (currentPlayers > summary.avgPlayers) return "up";
    if (currentPlayers < summary.avgPlayers) return "down";
    return "neutral";
  }, [server, summary.avgPlayers]);

  const currentPlayers = server?.status.playerCount ?? 0;
  const maxPlayers = server?.status.maxPlayers ?? 0;
  const peakTimeLabel =
    summary.peakTime === null
      ? tStats("peakTimeEmpty")
      : tStats("peakTime", { time: summary.peakTime });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={tStats("currentOnlineLabel")}
          value={`${currentPlayers}/${maxPlayers}`}
          subtext={tStats("currentOnlineSubtext", {
            period: stats?.period ?? period,
            avg: summary.avgPlayers,
          })}
          trend={playerTrend}
        />
        <StatCard
          label={tStats("peakPlayersLabel")}
          value={`${summary.peakPlayers}`}
          subtext={tStats("peakPlayersSubtext", { label: peakTimeLabel })}
          trend="up"
        />
        <StatCard
          label={tStats("uptimeLabel")}
          value={`${summary.uptimePercent.toFixed(1)}%`}
          subtext={tStats("uptimeSubtext", {
            online: summary.onlineChecks,
            total: summary.totalChecks,
          })}
          trend={summary.uptimePercent >= 90 ? "up" : "down"}
        />
      </div>

      <PlayerChart
        dataPoints={stats?.dataPoints ?? []}
        period={period}
        summary={summary}
        isLoading={isStatsLoading}
        onPeriodChange={setPeriod}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <PeakHours hourlyAverages={peakHourly} isLoading={isPeakLoading} />
      </div>

      <RecentComments serverId={serverId} />
    </div>
  );
}
