"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { UserAvatar } from "@/components/UserAvatar";
import { timeAgo } from "@/lib/time";
import type { CircleBanItem } from "@/lib/types";

interface CircleBanManagerProps {
  circleId: string;
}

interface BansResponse {
  bans?: CircleBanItem[];
  total?: number;
  page?: number;
  totalPages?: number;
  error?: string;
}

function parseBansPayload(raw: unknown): BansResponse {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    bans: Array.isArray(payload.bans) ? (payload.bans as CircleBanItem[]) : undefined,
    total: typeof payload.total === "number" ? payload.total : undefined,
    page: typeof payload.page === "number" ? payload.page : undefined,
    totalPages: typeof payload.totalPages === "number" ? payload.totalPages : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

/**
 * 圈子封禁管理组件。
 * 支持查看封禁列表、添加封禁和解除封禁。
 */
export function CircleBanManager({ circleId }: CircleBanManagerProps) {
  const confirm = useConfirm();
  const [bans, setBans] = useState<CircleBanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [unbanningId, setUnbanningId] = useState<string | null>(null);

  // Add ban form state
  const [showBanForm, setShowBanForm] = useState(false);
  const [banUserId, setBanUserId] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banDuration, setBanDuration] = useState<string>("permanent");
  const [isBanning, setIsBanning] = useState(false);

  const fetchBans = useCallback(
    async (targetPage: number) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/circles/${circleId}/bans?page=${targetPage}&limit=20`,
          { cache: "no-store" },
        );
        const payload = parseBansPayload(await response.json().catch(() => ({})));

        if (!response.ok) {
          throw new Error(payload.error ?? "封禁列表加载失败");
        }

        setBans(payload.bans ?? []);
        setTotal(payload.total ?? 0);
        setPage(payload.page ?? targetPage);
        setTotalPages(payload.totalPages ?? 1);
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : "封禁列表加载失败";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [circleId],
  );

  useEffect(() => {
    void fetchBans(1);
  }, [fetchBans]);

  const handleUnban = useCallback(
    async (userId: string) => {
      const confirmed = await confirm({
        title: "解除封禁",
        message: "确定要解除该用户的封禁吗？",
      });
      if (!confirmed) {
        return;
      }

      setUnbanningId(userId);
      setError(null);

      try {
        const response = await fetch(`/api/circles/${circleId}/bans/${userId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const result: unknown = await response.json().catch(() => ({}));
          const payload = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
          throw new Error(typeof payload.error === "string" ? payload.error : "解禁失败");
        }

        await fetchBans(page);
      } catch (unbanError) {
        const message = unbanError instanceof Error ? unbanError.message : "解禁失败";
        setError(message);
      } finally {
        setUnbanningId(null);
      }
    },
    [circleId, confirm, fetchBans, page],
  );

  const handleBan = useCallback(async () => {
    if (!banUserId.trim()) {
      setError("请输入用户 ID");
      return;
    }

    setIsBanning(true);
    setError(null);

    let expiresAt: string | undefined;
    if (banDuration !== "permanent") {
      const now = new Date();
      const durationMs = parseInt(banDuration, 10);
      expiresAt = new Date(now.getTime() + durationMs).toISOString();
    }

    try {
      const response = await fetch(`/api/circles/${circleId}/bans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: banUserId.trim(),
          reason: banReason.trim() || undefined,
          expiresAt,
        }),
      });

      const result: unknown = await response.json().catch(() => ({}));
      const payload = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};

      if (!response.ok) {
        const errorMessage = typeof payload.error === "string" ? payload.error : "封禁失败";
        throw new Error(errorMessage);
      }

      setBanUserId("");
      setBanReason("");
      setBanDuration("permanent");
      setShowBanForm(false);
      await fetchBans(1);
    } catch (banError) {
      const message = banError instanceof Error ? banError.message : "封禁失败";
      setError(message);
    } finally {
      setIsBanning(false);
    }
  }, [circleId, banUserId, banReason, banDuration, fetchBans]);

  function formatExpiry(expiresAt: string | null): string {
    if (!expiresAt) {
      return "永久封禁";
    }

    const expiry = new Date(expiresAt);
    if (expiry.getTime() <= Date.now()) {
      return "已过期";
    }

    return `${expiry.toLocaleDateString("zh-CN")} 到期`;
  }

  const DURATION_OPTIONS = [
    { value: "permanent", label: "永久" },
    { value: String(1 * 24 * 60 * 60 * 1000), label: "1 天" },
    { value: String(3 * 24 * 60 * 60 * 1000), label: "3 天" },
    { value: String(7 * 24 * 60 * 60 * 1000), label: "7 天" },
    { value: String(30 * 24 * 60 * 60 * 1000), label: "30 天" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-warm-800">封禁管理</h3>
        {total > 0 && (
          <span className="text-xs text-warm-500">{total} 条封禁</span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-accent-hover/20 bg-accent-muted px-3 py-2 text-sm text-accent-hover">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="mt-4 flex justify-center py-8">
          <LoadingSpinner text="加载封禁列表..." />
        </div>
      ) : bans.length === 0 && !showBanForm ? (
        <div className="mt-4">
          <EmptyState title="暂无封禁" description="当前没有被封禁的用户" />
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {bans.map((ban) => (
              <div
                key={ban.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warm-200 bg-surface px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar
                    src={ban.user.image}
                    name={ban.user.name}
                    className="h-10 w-10"
                    fallbackClassName="bg-accent text-white"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-warm-800">
                        {ban.user.name ?? "未知用户"}
                      </span>
                      <span className="rounded bg-accent-muted px-1.5 py-0.5 text-xs text-accent-hover ring-1 ring-accent-hover/20">
                        {formatExpiry(ban.expiresAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-warm-500">
                      {ban.reason && (
                        <span>原因: {ban.reason}</span>
                      )}
                      <span>
                        {timeAgo(ban.createdAt)} 由 {ban.banner.name ?? "未知"} 封禁
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleUnban(ban.userId)}
                  disabled={unbanningId === ban.userId}
                  className="rounded-lg border border-warm-200 bg-surface px-3 py-1.5 text-xs text-warm-600 transition-colors hover:bg-warm-50"
                >
                  {unbanningId === ban.userId ? "解禁中..." : "解除封禁"}
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void fetchBans(page - 1)}
                disabled={page <= 1 || isLoading}
                className="m3-btn rounded-lg border border-warm-200 bg-surface px-3 py-1.5 text-sm text-warm-800 transition-colors hover:bg-warm-50 disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-sm text-warm-500">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => void fetchBans(page + 1)}
                disabled={page >= totalPages || isLoading}
                className="m3-btn rounded-lg border border-warm-200 bg-surface px-3 py-1.5 text-sm text-warm-800 transition-colors hover:bg-warm-50 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {/* Add ban form */}
      {showBanForm ? (
        <div className="mt-4 rounded-xl border border-warm-200 bg-surface px-4 py-3">
          <h4 className="text-sm font-medium text-warm-800">添加封禁</h4>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-warm-500">用户 ID</label>
              <input
                type="text"
                value={banUserId}
                onChange={(e) => setBanUserId(e.target.value)}
                placeholder="输入要封禁的用户 ID"
                className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-warm-500">封禁时长</label>
              <select
                value={banDuration}
                onChange={(e) => setBanDuration(e.target.value)}
                className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-warm-500">原因（选填）</label>
              <input
                type="text"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="封禁原因"
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleBan()}
                disabled={isBanning || !banUserId.trim()}
                className="m3-btn m3-btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBanning ? "封禁中..." : "确认封禁"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBanForm(false);
                  setBanUserId("");
                  setBanReason("");
                  setBanDuration("permanent");
                }}
                disabled={isBanning}
                className="m3-btn m3-btn-tonal px-3 py-1.5 text-xs"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowBanForm(true)}
          className="mt-3 w-full rounded-xl border border-dashed border-warm-300 px-4 py-2.5 text-sm text-warm-500 transition-colors hover:border-accent hover:text-accent"
        >
          + 添加封禁
        </button>
      )}
    </div>
  );
}
