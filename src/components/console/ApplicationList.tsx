"use client";

import { useCallback, useEffect, useState } from "react";
import { Pagination } from "@/components/Pagination";
import { UserAvatar } from "@/components/UserAvatar";
import { timeAgo } from "@/lib/time";
import type { ApplicationStatus, ServerApplicationItem } from "@/lib/types";

type TabStatus = "pending" | "approved" | "rejected";

interface ApplicationListProps {
  serverId: string;
}

interface ApplicationsPayload {
  data?: ServerApplicationItem[];
  total?: number;
  page?: number;
  totalPages?: number;
  error?: string;
}

function parsePayload(raw: unknown): ApplicationsPayload {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    data: Array.isArray(payload.data) ? (payload.data as ServerApplicationItem[]) : undefined,
    total: typeof payload.total === "number" ? payload.total : undefined,
    page: typeof payload.page === "number" ? payload.page : undefined,
    totalPages: typeof payload.totalPages === "number" ? payload.totalPages : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

const TABS: { key: TabStatus; label: string }[] = [
  { key: "pending", label: "待审核" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已拒绝" },
];

function statusBadge(status: ApplicationStatus) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center rounded-full bg-[#FDF5ED] px-2.5 py-0.5 text-xs font-medium text-coral-amber ring-1 ring-coral-amber/20">
          待审核
        </span>
      );
    case "approved":
      return (
        <span className="inline-flex items-center rounded-full bg-forest-light px-2.5 py-0.5 text-xs font-medium text-forest-dark ring-1 ring-forest/20">
          已通过
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center rounded-full bg-coral-light px-2.5 py-0.5 text-xs font-medium text-coral-hover ring-1 ring-coral-hover/20">
          已拒绝
        </span>
      );
    default:
      return null;
  }
}

function resolveUserName(app: ServerApplicationItem): string {
  return app.userName?.trim() || "匿名用户";
}

/**
 * 入服申请管理列表。
 * 服主可以查看、审核（通过 / 拒绝）玩家提交的入服申请。
 */
export function ApplicationList({ serverId }: ApplicationListProps) {
  const [activeTab, setActiveTab] = useState<TabStatus>("pending");
  const [page, setPage] = useState(1);
  const [applications, setApplications] = useState<ServerApplicationItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reject dialog state
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchApplications = useCallback(
    async (tab: TabStatus, targetPage: number) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/servers/${serverId}/applications?status=${tab}&page=${targetPage}&limit=10`,
          { cache: "no-store" },
        );
        const payload = parsePayload(await response.json().catch(() => ({})));

        if (!response.ok) {
          throw new Error(payload.error ?? "申请列表加载失败");
        }

        setApplications(payload.data ?? []);
        setTotalPages(payload.totalPages ?? 1);
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : "申请列表加载失败";
        setError(message);
        setApplications([]);
      } finally {
        setIsLoading(false);
      }
    },
    [serverId],
  );

  const fetchPendingCount = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/servers/${serverId}/applications?status=pending&page=1&limit=1`,
        { cache: "no-store" },
      );
      const payload = parsePayload(await response.json().catch(() => ({})));
      if (response.ok && typeof payload.total === "number") {
        setPendingCount(payload.total);
      }
    } catch {
      // Silently ignore — badge is non-critical
    }
  }, [serverId]);

  useEffect(() => {
    void fetchApplications(activeTab, page);
  }, [activeTab, page, fetchApplications]);

  useEffect(() => {
    void fetchPendingCount();
  }, [fetchPendingCount]);

  function handleTabChange(tab: TabStatus) {
    setActiveTab(tab);
    setPage(1);
    setRejectingId(null);
    setRejectNote("");
  }

  async function handleApprove(appId: string) {
    setActionLoading(appId);

    try {
      const response = await fetch(`/api/servers/${serverId}/applications/${appId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(typeof body.error === "string" ? body.error : "操作失败");
      }

      // Refresh list and pending count
      await Promise.all([fetchApplications(activeTab, page), fetchPendingCount()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "操作失败";
      setError(message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(appId: string) {
    setActionLoading(appId);

    try {
      const response = await fetch(`/api/servers/${serverId}/applications/${appId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reviewNote: rejectNote.trim() || undefined }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(typeof body.error === "string" ? body.error : "操作失败");
      }

      setRejectingId(null);
      setRejectNote("");

      // Refresh list and pending count
      await Promise.all([fetchApplications(activeTab, page), fetchPendingCount()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "操作失败";
      setError(message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <section className="m3-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-warm-800">入服申请管理</h2>

      {/* Status tabs */}
      <div className="mt-4 flex gap-1 border-b border-warm-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTabChange(tab.key)}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-coral text-coral"
                : "text-warm-500 hover:text-warm-700"
            }`}
          >
            {tab.label}
            {tab.key === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-amber px-1.5 text-[11px] font-semibold text-white">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-coral-hover/20 bg-coral-light px-4 py-2 text-sm text-coral-hover">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <p className="mt-6 text-center text-sm text-warm-500">加载中...</p>
      ) : applications.length === 0 ? (
        <p className="mt-6 text-center text-sm text-warm-500">暂无申请</p>
      ) : (
        <div className="mt-4 space-y-3">
          {applications.map((app) => (
            <div
              key={app.id}
              className="rounded-xl border border-warm-200 bg-[#FFFAF6] p-4 shadow-sm"
            >
              {/* Header: user info + status */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <UserAvatar
                    src={app.userImage}
                    name={app.userName}
                    className="h-10 w-10"
                    fallbackClassName="bg-gradient-to-br from-coral to-coral-amber text-white"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-warm-800">
                      {resolveUserName(app)}
                    </p>
                    {app.mcUsername && (
                      <p className="mt-0.5 text-xs text-warm-500">
                        MC 用户名：
                        <span className="font-mono text-warm-700">{app.mcUsername}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {statusBadge(app.status)}
                  <span className="text-xs text-warm-400">{timeAgo(app.createdAt)}</span>
                </div>
              </div>

              {/* Form answers */}
              {app.formData && Object.keys(app.formData).length > 0 && (
                <div className="mt-3 space-y-1.5 rounded-lg bg-warm-50 p-3">
                  {Object.entries(app.formData).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-sm">
                      <span className="shrink-0 font-medium text-warm-600">{key}:</span>
                      <span className="text-warm-700">
                        {Array.isArray(value) ? value.join(", ") : value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Review note (for reviewed applications) */}
              {app.status !== "pending" && app.reviewNote && (
                <div className="mt-3 rounded-lg border border-warm-100 bg-warm-50 p-3 text-sm">
                  <span className="font-medium text-warm-600">审核备注：</span>
                  <span className="text-warm-700">{app.reviewNote}</span>
                  {app.reviewerName && (
                    <span className="ml-2 text-xs text-warm-400">
                      — {app.reviewerName}
                    </span>
                  )}
                </div>
              )}

              {/* Actions for pending applications */}
              {app.status === "pending" && (
                <div className="mt-3">
                  {rejectingId === app.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="填写拒绝原因（可选）"
                        rows={2}
                        className="w-full rounded-lg border border-warm-200 bg-[#FFFAF6] px-3 py-2 text-sm text-warm-700 placeholder:text-warm-400 focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleReject(app.id)}
                          disabled={actionLoading === app.id}
                          className="rounded-lg bg-coral-hover px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-coral-dark disabled:opacity-50"
                        >
                          {actionLoading === app.id ? "处理中..." : "确认拒绝"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectNote("");
                          }}
                          disabled={actionLoading === app.id}
                          className="rounded-lg border border-warm-200 bg-[#FFFAF6] px-3 py-1.5 text-sm font-medium text-warm-600 transition-colors hover:bg-warm-50 disabled:opacity-50"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleApprove(app.id)}
                        disabled={actionLoading === app.id}
                        className="rounded-lg bg-coral px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-coral-hover disabled:opacity-50"
                      >
                        {actionLoading === app.id ? "处理中..." : "通过"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingId(app.id)}
                        disabled={actionLoading !== null}
                        className="rounded-lg border border-coral-hover/20 bg-[#FFFAF6] px-3 py-1.5 text-sm font-medium text-coral-hover transition-colors hover:bg-coral-light disabled:opacity-50"
                      >
                        拒绝
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </section>
  );
}
