"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/time";

import type { SyncStatusOverview, WhitelistSyncItem } from "@/lib/types";

interface SyncStatusProps {
  serverId: string;
}

const POLL_INTERVAL_MS = 15_000;

const STATUS_STYLES: Record<WhitelistSyncItem["status"], { label: string; className: string }> = {
  pending: { label: "等待中", className: "bg-[#FDF5ED] text-coral-amber ring-1 ring-coral-amber/20" },
  pushed: { label: "已推送", className: "bg-coral-light text-coral ring-1 ring-coral/20" },
  acked: { label: "已确认", className: "bg-forest-light text-forest-dark ring-1 ring-forest/20" },
  failed: { label: "失败", className: "bg-coral-light text-coral-hover ring-1 ring-coral-hover/20" },
};

const ACTION_LABELS: Record<WhitelistSyncItem["action"], string> = {
  add: "添加",
  remove: "移除",
};

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
 * 白名单同步状态组件。
 * 展示插件连接状态、同步统计和最近同步记录，每 15 秒自动刷新。
 */
export function SyncStatus({ serverId }: SyncStatusProps) {
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
            typeof payload.error === "string" ? payload.error : "同步状态加载失败",
          );
        }

        const data = parseSyncOverview(await response.json().catch(() => null));
        if (!data) {
          throw new Error("同步状态数据格式异常");
        }

        setOverview(data);
      } catch (fetchError) {
        const message =
          fetchError instanceof Error ? fetchError.message : "同步状态加载失败";
        setError(message);
      } finally {
        if (isInitial) {
          setIsLoading(false);
        }
      }
    },
    [serverId],
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
        <h2 className="text-lg font-semibold text-warm-800">白名单同步</h2>
        <p className="mt-4 text-sm text-warm-500">加载中...</p>
      </section>
    );
  }

  if (error && !overview) {
    return (
      <section className="m3-surface p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-warm-800">白名单同步</h2>
        <p className="mt-4 text-sm text-coral-hover">{error}</p>
      </section>
    );
  }

  if (!overview) {
    return null;
  }

  return (
    <section className="m3-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-warm-800">白名单同步</h2>

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
          {overview.connected ? "插件已连接" : "插件未连接"}
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-coral-hover">{error}</p>}

      {/* Stats row */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-warm-500">等待同步</span>
          <span
            className={`font-semibold ${
              overview.pendingCount > 0 ? "text-coral-amber" : "text-warm-700"
            }`}
          >
            {overview.pendingCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-warm-500">同步失败</span>
          <span
            className={`font-semibold ${
              overview.failedCount > 0 ? "text-coral-hover" : "text-warm-700"
            }`}
          >
            {overview.failedCount}
          </span>
        </div>
        {overview.lastAckedAt && (
          <div className="flex items-center gap-2">
            <span className="text-warm-500">最近确认</span>
            <span className="font-medium text-warm-700">
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
                <th className="pb-2 pr-4 font-medium">MC 用户名</th>
                <th className="pb-2 pr-4 font-medium">操作</th>
                <th className="pb-2 pr-4 font-medium">状态</th>
                <th className="pb-2 font-medium">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-100">
              {overview.recentSyncs.map((sync) => {
                const statusStyle = STATUS_STYLES[sync.status];
                return (
                  <tr key={sync.id}>
                    <td className="py-2.5 pr-4 font-mono text-warm-800">
                      {sync.mcUsername ?? "-"}
                    </td>
                    <td className="py-2.5 pr-4 text-warm-600">
                      {ACTION_LABELS[sync.action] ?? sync.action}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.className}`}
                      >
                        {statusStyle.label}
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
        <p className="mt-4 text-sm text-warm-500">暂无同步记录。</p>
      )}
    </section>
  );
}
