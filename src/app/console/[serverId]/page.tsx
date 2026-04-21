"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiKeyManager } from "@/components/console/ApiKeyManager";
import { ApplicationList } from "@/components/console/ApplicationList";
import { InviteManager } from "@/components/console/InviteManager";
import { MemberList } from "@/components/console/MemberList";
import { isPrivateServersEnabled } from "@/lib/features";
import { PeakHours } from "@/components/console/PeakHours";
import { PlayerChart } from "@/components/console/PlayerChart";
import { RecentComments } from "@/components/console/RecentComments";
import { ServerActions } from "@/components/console/ServerActions";
import { ServerSettings } from "@/components/console/ServerSettings";
import { StatCard } from "@/components/console/StatCard";
import { SyncStatus } from "@/components/console/SyncStatus";
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
    (typeof value.peakTime === "string" || value.peakTime === null) &&
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
    dataPoints: Array.isArray(raw.dataPoints) ? raw.dataPoints.filter(isStatsDataPoint) : undefined,
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
 * Server control panel.
 * Aggregates trend stats, peak analysis, comment highlights, and management actions.
 */
export default function ConsoleServerPage() {
  const params = useParams<{ serverId: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const tStats = useTranslations("console.stats");
  const tPage = useTranslations("console.page");
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
        throw new Error(payload.error ?? tPage("serverLoadFailed"));
      }

      const currentUserId = session?.user?.id;
      if (!currentUserId || payload.data.ownerId !== currentUserId) {
        throw new Error(tPage("forbidden"));
      }

      setServer(payload.data);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : tPage("serverLoadFailed");
      setError(message);
      setServer(null);
    } finally {
      setIsServerLoading(false);
    }
  }, [serverId, session?.user?.id, tPage]);

  const fetchStats = useCallback(
    async (targetPeriod: StatsPeriod) => {
      setIsStatsLoading(true);

      try {
        const response = await fetch(`/api/servers/${serverId}/stats?period=${targetPeriod}`, {
          cache: "no-store",
        });
        const payload = parseStatsPayload(await response.json().catch(() => ({})));

        if (!response.ok) {
          throw new Error(payload.error ?? tPage("statsLoadFailed"));
        }

        if (!payload.period || !payload.dataPoints || !payload.summary || !payload.hourlyAverages) {
          throw new Error(tPage("statsFormatInvalid"));
        }

        setStats({
          period: payload.period,
          dataPoints: payload.dataPoints,
          summary: payload.summary,
          hourlyAverages: payload.hourlyAverages,
        });
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : tPage("statsLoadFailed");
        setError(message);
        setStats(null);
      } finally {
        setIsStatsLoading(false);
      }
    },
    [serverId, tPage],
  );

  const fetchPeakHours = useCallback(async () => {
    setIsPeakLoading(true);

    try {
      const response = await fetch(`/api/servers/${serverId}/stats?period=7d`, {
        cache: "no-store",
      });
      const payload = parseStatsPayload(await response.json().catch(() => ({})));

      if (!response.ok) {
        throw new Error(payload.error ?? tPage("peakLoadFailed"));
      }

      if (!payload.hourlyAverages) {
        throw new Error(tPage("peakFormatInvalid"));
      }

      setPeakHourly(payload.hourlyAverages);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : tPage("peakLoadFailed");
      setError(message);
      setPeakHourly([]);
    } finally {
      setIsPeakLoading(false);
    }
  }, [serverId, tPage]);

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
        peakTime: null,
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
    return <PageLoading text={tPage("loading")} />;
  }

  if (status === "unauthenticated") {
    return <p className="py-10 text-center text-sm text-warm-500">{tPage("redirectingToLogin")}</p>;
  }

  if (error && !server) {
    return <div className="m3-alert-error p-4">{error}</div>;
  }

  if (!server) {
    return <div className="m3-alert-error p-4">{tPage("serverNotFoundOrForbidden")}</div>;
  }

  const serverAddress = resolveServerAddress(server);
  const currentPlayers = server.status.playerCount ?? 0;
  const maxPlayers = server.status.maxPlayers ?? 0;
  const reviewStatus = server.reviewStatus ?? "approved";
  const peakTimeLabel =
    summary.peakTime === null
      ? tStats("peakTimeEmpty")
      : tStats("peakTime", { time: summary.peakTime });

  return (
    <div className="space-y-4 pb-4">
      {error && <div className="m3-alert-error px-4 py-3">{error}</div>}

      <section className="m3-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-warm-700">{server.name}</h1>
            <p className="mt-1 font-mono text-sm text-warm-500">{serverAddress}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
                server.status.online
                  ? "bg-forest-light text-forest-dark ring-1 ring-forest-light"
                  : "bg-warm-100 text-warm-500 ring-1 ring-warm-200"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  server.status.online ? "bg-forest" : "bg-warm-400"
                }`}
              />
              {server.status.online ? tPage("badgeOnline") : tPage("badgeOffline")}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                server.isVerified
                  ? "bg-coral-light text-coral-dark ring-1 ring-coral-light"
                  : "bg-coral-amber/10 text-coral-amber ring-1 ring-coral-amber/20"
              }`}
            >
              {server.isVerified ? tPage("badgeVerified") : tPage("badgeUnverified")}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-medium ${
                reviewStatus === "approved"
                  ? "bg-forest-light text-forest-dark ring-1 ring-forest-light"
                  : reviewStatus === "pending"
                    ? "bg-coral-amber/10 text-coral-amber ring-1 ring-coral-amber/20"
                    : "bg-coral-light text-coral-hover ring-1 ring-coral-light"
              }`}
            >
              {reviewStatus === "approved"
                ? tPage("reviewApproved")
                : reviewStatus === "pending"
                  ? tPage("reviewPending")
                  : tPage("reviewRejected")}
            </span>
          </div>
        </div>
      </section>

      {reviewStatus === "pending" && (
        <section className="rounded-xl border border-coral-amber/20 bg-coral-amber/10 px-4 py-3 text-sm text-coral-amber">
          {tPage("reviewPendingNotice")}
        </section>
      )}

      {reviewStatus === "rejected" && (
        <section className="rounded-xl border border-coral-hover/20 bg-coral-light px-4 py-3 text-sm text-coral-hover">
          <p className="font-medium">{tPage("reviewRejectedTitle")}</p>
          <p className="mt-1 text-xs">
            {tPage("reviewRejectReason", {
              reason: server.rejectReason?.trim() || tPage("reviewRejectReasonMissing"),
            })}
          </p>
          <Link
            href={`/servers/${server.psid}/edit`}
            className="mt-2 inline-flex text-xs underline underline-offset-4"
          >
            {tPage("reviewRejectEditLink")}
          </Link>
        </section>
      )}

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
        <ServerActions
          serverId={String(server.psid)}
          serverName={server.name}
          isVerified={server.isVerified}
          onDeleted={() => {
            router.replace("/console");
          }}
        />
      </div>

      <RecentComments serverId={String(server.psid)} />

      <ServerSettings
        serverId={String(server.psid)}
        initialVisibility={server.visibility ?? "public"}
        initialDiscoverable={server.discoverable ?? false}
        initialJoinMode={server.joinMode ?? "open"}
        initialApplicationForm={server.applicationForm ?? null}
        onSaved={fetchServer}
      />

      {isPrivateServersEnabled() && (server.joinMode === "apply" || server.joinMode === "apply_and_invite") && (
        <ApplicationList serverId={String(server.psid)} />
      )}

      {isPrivateServersEnabled() && (server.joinMode === "invite" || server.joinMode === "apply_and_invite") && (
        <InviteManager serverId={String(server.psid)} serverPsid={server.psid} />
      )}

      {isPrivateServersEnabled() && server.visibility !== "public" && (
        <MemberList serverId={String(server.psid)} />
      )}

      {isPrivateServersEnabled() && server.visibility !== "public" && (
        <>
          <ApiKeyManager
            serverId={String(server.psid)}
            hasApiKey={!!server.hasApiKey}
          />
          <SyncStatus serverId={String(server.psid)} />
        </>
      )}
    </div>
  );
}
