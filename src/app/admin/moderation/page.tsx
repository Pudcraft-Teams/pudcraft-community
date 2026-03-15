"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { PageLoading } from "@/components/PageLoading";
import type {
  AdminModerationLogItem,
  AdminModerationStats,
  PaginationInfo,
} from "@/lib/types";

const FILTER_TABS = [
  { key: "failed", label: "已拦截" },
  { key: "unreviewed", label: "待处理" },
  { key: "passed", label: "已通过" },
  { key: "all", label: "全部" },
] as const;

const TYPE_TABS = [
  { key: "all", label: "全部" },
  { key: "server", label: "服务器" },
  { key: "modpack", label: "整合包" },
  { key: "username", label: "用户名" },
  { key: "comment", label: "评论" },
] as const;

const CONTENT_TYPE_LABELS: Record<string, string> = {
  server: "服务器",
  modpack: "整合包",
  username: "用户名",
  comment: "评论",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export default function AdminModerationPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AdminModerationLogItem[]>([]);
  const [stats, setStats] = useState<AdminModerationStats | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("failed");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("filter", filter);
      params.set("type", type);

      const res = await fetch(`/api/admin/moderation?${params.toString()}`);
      if (!res.ok) throw new Error("加载失败");

      const json = (await res.json()) as {
        data: AdminModerationLogItem[];
        stats: AdminModerationStats;
        pagination: PaginationInfo;
      };
      setLogs(json.data);
      setStats(json.stats);
      setPagination(json.pagination);
    } catch {
      toast.error("加载审查日志失败");
    } finally {
      setIsLoading(false);
    }
  }, [page, filter, type, toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const markReviewed = async (id: string, adminNote?: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/moderation/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed: true, adminNote }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "操作失败");
      }
      toast.success("已标记为已阅");
      await fetchLogs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-warm-700">内容审查</h1>

      {/* 统计卡片 */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="m3-surface p-4">
            <p className="text-sm text-warm-500">近 7 天审查</p>
            <p className="mt-1 text-3xl font-bold text-coral">{stats.total}</p>
          </div>
          <div className="m3-surface p-4">
            <p className="text-sm text-warm-500">已拦截</p>
            <p className="mt-1 text-3xl font-bold text-coral-hover">{stats.failed}</p>
          </div>
          <div className="m3-surface p-4">
            <p className="text-sm text-warm-500">拦截率</p>
            <p className="mt-1 text-3xl font-bold text-coral-amber">
              {stats.total > 0 ? `${Math.round((stats.failed / stats.total) * 100)}%` : "—"}
            </p>
          </div>
          <div className="m3-surface p-4">
            <p className="text-sm text-warm-500">待处理</p>
            <p className="mt-1 text-3xl font-bold text-warm-800">{stats.unreviewed}</p>
          </div>
        </div>
      )}

      {/* 状态筛选 */}
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setFilter(tab.key);
              setPage(1);
            }}
            className={`m3-chip text-sm ${filter === tab.key ? "m3-chip-active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 类型筛选 */}
      <div className="mb-6 flex flex-wrap gap-2">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setType(tab.key);
              setPage(1);
            }}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              type === tab.key
                ? "bg-coral-light font-medium text-coral-dark"
                : "bg-warm-100 text-warm-600 hover:bg-warm-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageLoading />
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-sm text-warm-500">暂无审查记录</div>
      ) : (
        <>
          {/* 日志表格 */}
          <div className="m3-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-warm-200 text-xs text-warm-500">
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">类型</th>
                  <th className="px-4 py-3 font-medium">内容预览</th>
                  <th className="px-4 py-3 font-medium">结果</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">违规类别</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">原因</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">用户</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className={`border-b border-warm-100 transition-colors last:border-0 hover:bg-warm-50 ${
                      !log.passed && !log.reviewed ? "bg-coral-light/50" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-warm-500">
                      {timeAgo(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-md bg-warm-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                        {CONTENT_TYPE_LABELS[log.contentType] ?? log.contentType}
                      </span>
                    </td>
                    <td className="max-w-48 truncate px-4 py-3 text-xs text-warm-700">
                      {log.contentSnippet}
                    </td>
                    <td className="px-4 py-3">
                      {log.passed ? (
                        <span className="inline-block rounded-full bg-forest-light px-2 py-0.5 text-xs font-medium text-forest-dark ring-1 ring-forest-light">
                          通过
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-coral-light px-2 py-0.5 text-xs font-medium text-coral-hover ring-1 ring-coral-hover/20">
                          拦截
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-600 md:table-cell">
                      {log.aiCategory ?? "—"}
                    </td>
                    <td className="hidden max-w-32 truncate px-4 py-3 text-xs text-warm-600 lg:table-cell">
                      {log.aiReason ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-600 sm:table-cell">
                      {log.userName ?? log.userIp ?? "匿名"}
                    </td>
                    <td className="px-4 py-3">
                      {!log.passed && !log.reviewed ? (
                        <button
                          type="button"
                          disabled={actionLoading === log.id}
                          onClick={() => markReviewed(log.id)}
                          className="rounded bg-coral-light px-2 py-1 text-xs font-medium text-coral transition-colors hover:bg-coral-light/80 disabled:opacity-50"
                        >
                          标记已阅
                        </button>
                      ) : log.reviewed ? (
                        <span className="text-xs text-warm-400">已处理</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-warm-500">
              <span>
                共 {pagination.total} 条，第 {pagination.page}/{pagination.totalPages} 页
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="m3-btn m3-btn-tonal px-3 py-1 text-xs disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="m3-btn m3-btn-tonal px-3 py-1 text-xs disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
