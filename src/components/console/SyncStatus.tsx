"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/time";

import type { SyncStatusOverview, WhitelistSyncItem } from "@/lib/types";

interface SyncStatusProps {
  serverId: string;
}

const POLL_INTERVAL_MS = 15_000;

const STATUS_CLASSNAMES: Record<WhitelistSyncItem["status"], string> = {
  pending: "bg-accent-muted text-accent-hover ring-1 ring-accent-hover/20",
  pushed: "bg-accent-muted text-accent ring-1 ring-accent/20",
  acked: "bg-forest-light text-forest-dark ring-1 ring-forest/20",
  failed: "bg-accent-muted text-accent-hover ring-1 ring-accent-hover/20",
};

function resolveStatusLabel(
  status: WhitelistSyncItem["status"],
  t: ReturnType<typeof useTranslations>,
): string {
  if (status === "pending") return t("statusPending");
  if (status === "pushed") return t("statusPushed");
  if (status === "acked") return t("statusAcked");
  return t("statusFailed");
}

function resolveActionLabel(
  action: WhitelistSyncItem["action"],
  t: ReturnType<typeof useTranslations>,
): string {
  if (action === "add") return t("actionAdd");
  if (action === "remove") return t("actionRemove");
  return action;
}

function parseSyncOverview(raw: unknown): SyncStatusOverview | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const payload = raw as Record<string, unknown>;

  if (typeof payload.connected !== "boolean" || typeof payload.pendingCount !== "number" || typeof payload.failedCount !== "number") {
    return null;
  }

  return {
    connected: payload.connected,
    pendingCount: payload.pendingCount,
    failedCount: payload.failedCount,
    lastAckedAt: typeof payload.lastAckedAt === "string" ? payload.lastAckedAt : null,
    recentSyncs: Array.isArray(payload.recentSyncs)
      ? (payload.recentSyncs as WhitelistSyncItem[])
      : [],
  };
}

/**
 * Whitelist-sync status component.
 * Shows plugin connection state, counters, and recent sync records. Refreshes every 15s.
 */
export function SyncStatus({ serverId }: SyncStatusProps) {
  const t = useTranslations("console.sync");
  const [overview, setOverview] = useState<SyncStatusOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(
    async (isInitial: boolean) => {
      if (isInitial) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await fetch(`/api/servers/${serverId}/sync/status`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
          throw new Error(
            typeof payload.error === "string" ? payload.error : t("loadFailed"),
          );
        }

        const data = parseSyncOverview(await response.json().catch(() => null));
        if (!data) {
          throw new Error(t("formatInvalid"));
        }

        setOverview(data);
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : t("loadFailed");
        setError(message);
      } finally {
        if (isInitial) {
          setIsLoading(false);
        }
      }
    },
    [serverId, t],
  );

  useEffect(() => {
    void fetchStatus(true);

    timerRef.current = setInterval(() => {
      void fetchStatus(false);
    }, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [fetchStatus]);

  if (isLoading) {
    return (
      <section className="m3-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>
        <p className="mt-4 text-sm text-warm-500">{t("loading")}</p>
      </section>
    );
  }

  if (error && !overview) {
    return (
      <section className="m3-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>
        <p className="mt-4 text-sm text-accent-hover">{error}</p>
      </section>
    );
  }

  if (!overview) {
    return null;
  }

  return (
    <section className="m3-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>

        {/* Connection status indicator */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            overview.connected
              ? "bg-forest-light text-forest-dark ring-1 ring-forest/20"
              : "bg-warm-100 text-warm-500 ring-1 ring-warm-200"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              overview.connected ? "bg-forest" : "bg-warm-400"
            }`}
          />
          {overview.connected ? t("pluginConnected") : t("pluginDisconnected")}
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-accent-hover">{error}</p>}

      {/* Stats row */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-warm-500">{t("pendingLabel")}</span>
          <span
            className={`font-semibold ${
              overview.pendingCount > 0 ? "text-accent-hover" : "text-warm-800"
            }`}
          >
            {overview.pendingCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-warm-500">{t("failedLabel")}</span>
          <span
            className={`font-semibold ${
              overview.failedCount > 0 ? "text-accent-hover" : "text-warm-800"
            }`}
          >
            {overview.failedCount}
          </span>
        </div>
        {overview.lastAckedAt && (
          <div className="flex items-center gap-2">
            <span className="text-warm-500">{t("lastAckedLabel")}</span>
            <span className="font-medium text-warm-800">
              {timeAgo(overview.lastAckedAt)}
            </span>
          </div>
        )}
      </div>

      {/* Recent syncs table */}
      {overview.recentSyncs.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-warm-200 text-xs text-warm-500">
                <th className="pb-2 pr-4 font-medium">{t("tableMcUsername")}</th>
                <th className="pb-2 pr-4 font-medium">{t("tableAction")}</th>
                <th className="pb-2 pr-4 font-medium">{t("tableStatus")}</th>
                <th className="pb-2 font-medium">{t("tableTime")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-100">
              {overview.recentSyncs.map((sync) => {
                const statusClassName = STATUS_CLASSNAMES[sync.status];
                return (
                  <tr key={sync.id}>
                    <td className="py-2.5 pr-4 font-mono text-warm-800">
                      {sync.mcUsername ?? "-"}
                    </td>
                    <td className="py-2.5 pr-4 text-warm-500">
                      {resolveActionLabel(sync.action, t)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClassName}`}
                      >
                        {resolveStatusLabel(sync.status, t)}
                      </span>
                    </td>
                    <td className="py-2.5 text-warm-500">
                      {timeAgo(sync.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-warm-500">{t("emptyRecords")}</p>
      )}
    </section>
  );
}
