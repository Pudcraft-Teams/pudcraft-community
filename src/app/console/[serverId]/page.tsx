"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PeakHours } from "@/components/console/PeakHours";
import { PlayerChart } from "@/components/console/PlayerChart";
import { RecentComments } from "@/components/console/RecentComments";
import { ServerActions } from "@/components/console/ServerActions";
import { StatCard } from "@/components/console/StatCard";
import type {
  ConsoleHourlyAveragePoint,
  ConsoleStatsDataPoint,
  ConsoleStatsResponse,
  ConsoleStatsSummary,
  StatsPeriod,
} from "@/components/console/types";
import { PageLoading } from "@/components/PageLoading";
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
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.time === "string" &&
    typeof value.playerCount === "number" &&
    typeof value.maxPlayers === "number" &&
    typeof value.isOnline === "boolean"
  );
}

function isStatsSummary(value: unknown): value is ConsoleStatsSummary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.avgPlayers === "number" &&
    typeof value.peakPlayers === "number" &&
    typeof value.peakTime === "string" &&
    typeof value.uptimePercent === "number" &&
    typeof value.totalChecks === "number" &&
    typeof value.onlineChecks === "number"
  );
}

function isHourlyAveragePoint(value: unknown): value is ConsoleHourlyAveragePoint {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.hour === "string" &&
    typeof value.avgPlayers === "number" &&
    typeof value.sampleCount === "number"
  );
}

function parseServerPayload(raw: unknown): ServerDetailPayload {
  if (!isRecord(raw)) {
    return {};
  }

  return {
    data: isRecord(raw.data) ? (raw.data as unknown as ServerDetail) : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

function parseStatsPayload(raw: unknown): StatsPayload {
  if (!isRecord(raw)) {
    return {};
  }

  return {
    period: isStatsPeriod(raw.period) ? raw.period : undefined,
    dataPoints: Array.isArray(raw.dataPoints)
      ? raw.dataPoints.filter(isStatsDataPoint)
      : undefined,
    summary: isStatsSummary(raw.summary) ? raw.summary : undefined,
    hourlyAverages: Array.isArray(raw.hourlyAverages)
      ? raw.hourlyAverages.filter(isHourlyAveragePoint)
      : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
  };
}

function resolveServerAddress(server: ServerDetail): string {
  return server.port === 25565 ? server.host : `${server.host}:${server.port}`;
}

/**
 * 服务器控制面板。
 * 聚合展示服主的趋势统计、高峰分析、评论摘要与管理操作。
 */
export default function ConsoleServerPage() {
  const params = useParams<{ serverId: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [period, setPeriod] = useState<StatsPeriod>("24h");
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [stats, setStats] = useState<ConsoleStatsResponse | null>(null);
  const [peakHourly, setPeakHourly] = useState<ConsoleHourlyAveragePoint[]>([]);
  const [isServerLoading, setIsServerLoading] = useState(true);
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [isPeakLoading, setIsPeakLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const serverId = params.serverId;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/console/${serverId}`)}`);
    }
  }, [router, serverId, status]);

  const fetchServer = useCallback(async () => {
    setIsServerLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/servers/${serverId}`, { cache: "no-store" });
      const payload = parseServerPayload(await response.json().catch(() => ({})));

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "服务器加载失败");
      }

      const currentUserId = session?.user?.id;
      if (!currentUserId || payload.data.ownerId !== currentUserId) {
        throw new Error("无权限访问该服务器控制台");
      }

      setServer(payload.data);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "服务器加载失败";
      setError(message);
      setServer(null);
    } finally {
      setIsServerLoading(false);
    }
  }, [serverId, session?.user?.id]);

  const fetchStats = useCallback(
    async (targetPeriod: StatsPeriod) => {
      setIsStatsLoading(true);

      try {
        const response = await fetch(`/api/servers/${serverId}/stats?period=${targetPeriod}`, {
          cache: "no-store",
        });
        const payload = parseStatsPayload(await response.json().catch(() => ({})));

        if (!response.ok) {
          throw new Error(payload.error ?? "统计数据加载失败");
        }

        if (!payload.period || !payload.dataPoints || !payload.summary || !payload.hourlyAverages) {
          throw new Error("统计数据格式异常");
        }

        setStats({
          period: payload.period,
          dataPoints: payload.dataPoints,
          summary: payload.summary,
          hourlyAverages: payload.hourlyAverages,
        });
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : "统计数据加载失败";
        setError(message);
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

      if (!response.ok) {
        throw new Error(payload.error ?? "高峰分析加载失败");
      }

      if (!payload.hourlyAverages) {
        throw new Error("高峰分析数据格式异常");
      }

      setPeakHourly(payload.hourlyAverages);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "高峰分析加载失败";
      setError(message);
      setPeakHourly([]);
    } finally {
      setIsPeakLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    void fetchServer();
    void fetchPeakHours();
  }, [fetchPeakHours, fetchServer, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    void fetchStats(period);
  }, [fetchStats, period, status]);

  const summary = useMemo<ConsoleStatsSummary>(() => {
    return (
      stats?.summary ?? {
        avgPlayers: 0,
        peakPlayers: 0,
        peakTime: "暂无数据",
        uptimePercent: 0,
        totalChecks: 0,
        onlineChecks: 0,
      }
    );
  }, [stats?.summary]);

  const playerTrend = useMemo<"up" | "down" | "neutral">(() => {
    if (!server) {
      return "neutral";
    }

    const currentPlayers = server.status.playerCount ?? 0;
    if (currentPlayers > summary.avgPlayers) {
      return "up";
    }
    if (currentPlayers < summary.avgPlayers) {
      return "down";
    }
    return "neutral";
  }, [server, summary.avgPlayers]);

  if (status === "loading" || isServerLoading) {
    return <PageLoading text="正在加载控制台..." />;
  }

  if (status === "unauthenticated") {
    return <p className="py-10 text-center text-sm text-slate-500">正在跳转到登录页...</p>;
  }

  if (error && !server) {
    return <div className="m3-alert-error p-4">{error}</div>;
  }

  if (!server) {
    return <div className="m3-alert-error p-4">服务器不存在或你无权访问该控制台。</div>;
  }

  const serverAddress = resolveServerAddress(server);
  const currentPlayers = server.status.playerCount ?? 0;
  const maxPlayers = server.status.maxPlayers ?? 0;
  const reviewStatus = server.reviewStatus ?? "approved";

  return (
    <div className="space-y-4 pb-4">
      {error && <div className="m3-alert-error px-4 py-3">{error}</div>}

      <section className="m3-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{server.name}</h1>
            <p className="mt-1 font-mono text-sm text-slate-500">{serverAddress}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
                server.status.online
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                  : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  server.status.online ? "bg-emerald-500" : "bg-slate-400"
                }`}
              />
              {server.status.online ? "在线" : "离线"}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                server.isVerified
                  ? "bg-teal-50 text-teal-700 ring-1 ring-teal-100"
                  : "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
              }`}
            >
              {server.isVerified ? "✓ 已认领" : "未认领"}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                reviewStatus === "approved"
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                  : reviewStatus === "pending"
                    ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100"
                    : "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
              }`}
            >
              {reviewStatus === "approved"
                ? "审核已通过"
                : reviewStatus === "pending"
                  ? "审核中"
                  : "审核未通过"}
            </span>
          </div>
        </div>
      </section>

      {reviewStatus === "pending" && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          当前服务器正在审核中，暂时不会出现在公开列表。
        </section>
      )}

      {reviewStatus === "rejected" && (
        <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <p className="font-medium">审核未通过</p>
          <p className="mt-1 text-xs">
            原因：{server.rejectReason?.trim() || "管理员未填写具体原因，请修改后重新提交。"}
          </p>
          <Link
            href={`/servers/${server.id}/edit`}
            className="mt-2 inline-flex text-xs underline underline-offset-4"
          >
            去编辑并重新提交
          </Link>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="当前在线"
          value={`${currentPlayers}/${maxPlayers}`}
          subtext={`近 ${stats?.period ?? period} 平均 ${summary.avgPlayers} 人`}
          trend={playerTrend}
        />
        <StatCard
          label="峰值在线"
          value={`${summary.peakPlayers}`}
          subtext={`峰值时段 ${summary.peakTime}`}
          trend="up"
        />
        <StatCard
          label="在线率"
          value={`${summary.uptimePercent.toFixed(1)}%`}
          subtext={`在线 ${summary.onlineChecks}/${summary.totalChecks} 次`}
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
        <ServerActions
          serverId={server.id}
          serverName={server.name}
          isVerified={server.isVerified}
          onDeleted={() => {
            router.replace("/console");
          }}
        />
      </div>

      <RecentComments serverId={server.id} />
    </div>
  );
}
