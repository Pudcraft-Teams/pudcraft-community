"use client";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { PageLoading } from "@/components/PageLoading";
import type { AdminServerItem, PaginationInfo } from "@/lib/types";

const STATUS_TABS = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待审核" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已拒绝" },
] as const;

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
          待审核
        </span>
      );
    case "approved":
      return (
        <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
          已通过
        </span>
      );
    case "rejected":
      return (
        <span className="inline-block rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
          已拒绝
        </span>
      );
    default:
      return null;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export default function AdminServersPage() {
  const { toast } = useToast();
  const [servers, setServers] = useState<AdminServerItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("status", statusFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/servers?${params.toString()}`);
      if (!res.ok) throw new Error("加载失败");

      const json = (await res.json()) as {
        data: AdminServerItem[];
        pagination: PaginationInfo;
      };
      setServers(json.data);
      setPagination(json.pagination);
    } catch {
      toast.error("加载服务器列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, search, toast]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/servers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "操作失败");
      }
      toast.success("服务器已通过审核");
      await fetchServers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) {
      toast.error("请填写拒绝原因");
      return;
    }

    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/servers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "操作失败");
      }
      toast.success("服务器已拒绝");
      setRejectingId(null);
      setRejectReason("");
      await fetchServers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`确定要删除服务器「${name}」吗？此操作不可恢复。`)) {
      return;
    }

    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/servers/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "删除失败");
      }
      toast.success("服务器已删除");
      await fetchServers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-slate-900">服务器管理</h1>

      {/* 状态筛选 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setStatusFilter(tab.key);
              setPage(1);
            }}
            className={`m3-chip text-sm ${statusFilter === tab.key ? "m3-chip-active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 搜索 */}
      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜索服务器名称或地址..."
          className="m3-input flex-1"
        />
        <button type="submit" className="m3-btn m3-btn-tonal">
          搜索
        </button>
      </form>

      {isLoading ? (
        <PageLoading />
      ) : servers.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500">暂无数据</div>
      ) : (
        <>
          {/* 服务器表格 */}
          <div className="m3-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">地址</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">提交者</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">认领</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">提交时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => (
                  <Fragment key={server.id}>
                  <tr
                    className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Image
                          src={server.iconUrl || "/default-server-icon.png"}
                          alt=""
                          width={28}
                          height={28}
                          className="rounded"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(expandedId === server.id ? null : server.id)
                          }
                          className="max-w-32 truncate font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-teal-700 hover:decoration-teal-400"
                          title="点击展开/收起详情"
                        >
                          {server.name}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {server.host}
                      {server.port !== 25565 ? `:${server.port}` : ""}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="text-xs text-slate-600">
                        {server.ownerName || server.ownerEmail || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {statusBadge(server.status)}
                      {server.status === "rejected" && server.rejectReason && (
                        <p
                          className="mt-1 max-w-52 truncate text-xs text-rose-600"
                          title={server.rejectReason}
                        >
                          原因：{server.rejectReason}
                        </p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span
                        className={`text-xs ${
                          server.isVerified ? "font-medium text-teal-700" : "text-slate-400"
                        }`}
                      >
                        {server.isVerified ? "已认领" : "未认领"}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                      {timeAgo(server.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {server.status !== "approved" && (
                          <button
                            type="button"
                            disabled={actionLoading === server.id}
                            onClick={() => handleApprove(server.id)}
                            className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                          >
                            通过
                          </button>
                        )}
                        {server.status !== "rejected" && (
                          <button
                            type="button"
                            disabled={actionLoading === server.id}
                            onClick={() => {
                              setRejectingId(server.id);
                              setRejectReason("");
                            }}
                            className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                          >
                            拒绝
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={actionLoading === server.id}
                          onClick={() => handleDelete(server.id, server.name)}
                          className="rounded bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                        >
                          删除
                        </button>
                      </div>

                      {/* 拒绝弹出 */}
                      {rejectingId === server.id && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="请说明拒绝原因"
                            className="m3-input w-full text-xs"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={actionLoading === server.id}
                              onClick={() => handleReject(server.id)}
                              className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                              确认拒绝
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectingId(null)}
                              className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* 展开详情行 */}
                  {expandedId === server.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-medium text-slate-700">简介：</span>
                            <span className="text-slate-600">
                              {server.description || "（未填写）"}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium text-slate-700">详介：</span>
                            {server.content ? (
                              <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                                {server.content}
                              </pre>
                            ) : (
                              <span className="text-slate-600">（未填写）</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
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
