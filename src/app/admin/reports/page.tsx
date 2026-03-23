"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { timeAgo } from "@/lib/time";
import { PageLoading } from "@/components/PageLoading";

const STATUS_TABS = [
  { key: "pending", label: "待处理" },
  { key: "resolved", label: "已处理" },
  { key: "dismissed", label: "已驳回" },
  { key: "all", label: "全部" },
] as const;

const TYPE_TABS = [
  { key: "all", label: "全部" },
  { key: "server", label: "服务器" },
  { key: "comment", label: "评论" },
  { key: "user", label: "用户" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  misinformation: "虚假信息",
  pornography: "色情低俗",
  harassment: "骚扰攻击",
  fraud: "广告欺诈",
  other: "其他",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  server: "服务器",
  comment: "评论",
  user: "用户",
};

const ACTION_OPTIONS = [
  { key: "warn", label: "警告" },
  { key: "takedown", label: "下架" },
  { key: "ban_user", label: "封禁用户" },
] as const;

type ActionKey = "warn" | "takedown" | "ban_user";

interface ReportReporter {
  id: string;
  name: string | null;
  email: string;
}

interface ReportItem {
  id: string;
  targetType: string;
  targetId: string;
  reporterId: string;
  reporter: ReportReporter;
  category: string;
  description: string | null;
  status: string;
  actions: string | null;
  adminNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}


export default function AdminReportsPage() {
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const [targetType, setTargetType] = useState("all");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Process dialog state
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedActions, setSelectedActions] = useState<ActionKey[]>([]);
  const [adminNote, setAdminNote] = useState("");

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("status", status);
      params.set("targetType", targetType);

      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      if (!res.ok) throw new Error("加载失败");

      const json = (await res.json()) as {
        reports: ReportItem[];
        total: number;
        pendingCount: number;
        page: number;
        totalPages: number;
      };
      setReports(json.reports);
      setTotalCount(json.total);
      setPendingCount(json.pendingCount);
      setTotalPages(json.totalPages);
    } catch {
      toast.error("加载举报列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [page, status, targetType, toast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const dismissReport = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "操作失败");
      }
      toast.success("已驳回");
      await fetchReports();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const resolveReport = async () => {
    if (!processingId) return;
    setActionLoading(processingId);
    try {
      const res = await fetch(`/api/admin/reports/${processingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          actions: selectedActions.length > 0 ? selectedActions : undefined,
          adminNote: adminNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "操作失败");
      }
      toast.success("已处理");
      closeProcessDialog();
      await fetchReports();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const openProcessDialog = (id: string) => {
    setProcessingId(id);
    setSelectedActions([]);
    setAdminNote("");
  };

  const closeProcessDialog = () => {
    setProcessingId(null);
    setSelectedActions([]);
    setAdminNote("");
  };

  const toggleAction = (action: ActionKey) => {
    setSelectedActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action],
    );
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-warm-700">举报管理</h1>

      {/* 统计卡片 */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-2">
        <div className="m3-surface p-4">
          <p className="text-sm text-warm-500">待处理举报</p>
          <p className="mt-1 text-3xl font-bold text-coral">{pendingCount}</p>
        </div>
        <div className="m3-surface p-4">
          <p className="text-sm text-warm-500">当前筛选结果</p>
          <p className="mt-1 text-3xl font-bold text-warm-800">{totalCount}</p>
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="mb-3 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setStatus(tab.key);
              setPage(1);
            }}
            className={`m3-chip text-sm ${status === tab.key ? "m3-chip-active" : ""}`}
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
              setTargetType(tab.key);
              setPage(1);
            }}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              targetType === tab.key
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
      ) : reports.length === 0 ? (
        <div className="py-12 text-center text-sm text-warm-500">暂无举报记录</div>
      ) : (
        <>
          {/* 举报表格 */}
          <div className="m3-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-warm-200 text-xs text-warm-500">
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">类型</th>
                  <th className="px-4 py-3 font-medium">分类</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">描述</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">举报人</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr
                    key={report.id}
                    className={`border-b border-warm-100 transition-colors last:border-0 hover:bg-warm-50 ${
                      report.status === "pending" ? "bg-coral-light/50" : ""
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-warm-500">
                      {timeAgo(report.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-md bg-warm-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                        {TARGET_TYPE_LABELS[report.targetType] ?? report.targetType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-md bg-warm-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                        {CATEGORY_LABELS[report.category] ?? report.category}
                      </span>
                    </td>
                    <td className="hidden max-w-48 truncate px-4 py-3 text-xs text-warm-700 sm:table-cell">
                      {report.description ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-600 md:table-cell">
                      {report.reporter.name ?? report.reporter.email}
                    </td>
                    <td className="px-4 py-3">
                      {report.status === "pending" ? (
                        <span className="inline-block rounded-full bg-coral-light px-2 py-0.5 text-xs font-medium text-coral-hover ring-1 ring-coral-hover/20">
                          待处理
                        </span>
                      ) : report.status === "resolved" ? (
                        <span className="inline-block rounded-full bg-forest-light px-2 py-0.5 text-xs font-medium text-forest-dark ring-1 ring-forest-light">
                          已处理
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-warm-100 px-2 py-0.5 text-xs font-medium text-warm-500 ring-1 ring-warm-200">
                          已驳回
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {report.status === "pending" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actionLoading === report.id}
                            onClick={() => dismissReport(report.id)}
                            className="rounded bg-warm-100 px-2 py-1 text-xs font-medium text-warm-600 transition-colors hover:bg-warm-200 disabled:opacity-50"
                          >
                            驳回
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading === report.id}
                            onClick={() => openProcessDialog(report.id)}
                            className="rounded bg-coral-light px-2 py-1 text-xs font-medium text-coral transition-colors hover:bg-coral-light/80 disabled:opacity-50"
                          >
                            处置
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-warm-400">
                          {report.status === "resolved" ? "已处理" : "已驳回"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-warm-500">
              <span>
                共 {totalCount} 条，第 {page}/{totalPages} 页
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
                  disabled={page >= totalPages}
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

      {/* 处置对话框 */}
      {processingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="m3-surface mx-4 w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-semibold text-warm-700">处置举报</h3>

            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-warm-600">执行操作</p>
              <div className="flex flex-wrap gap-2">
                {ACTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleAction(opt.key)}
                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                      selectedActions.includes(opt.key)
                        ? "bg-coral font-medium text-white"
                        : "bg-warm-100 text-warm-600 hover:bg-warm-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="admin-note" className="mb-1 block text-sm font-medium text-warm-600">
                管理员备注（可选）
              </label>
              <textarea
                id="admin-note"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm text-warm-700 outline-none transition-colors focus:border-coral focus:ring-1 focus:ring-coral"
                placeholder="备注处置原因..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeProcessDialog}
                className="rounded-lg px-4 py-2 text-sm text-warm-600 transition-colors hover:bg-warm-100"
              >
                取消
              </button>
              <button
                type="button"
                disabled={actionLoading === processingId}
                onClick={resolveReport}
                className="rounded-lg bg-coral px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-coral-hover disabled:opacity-50"
              >
                确认处置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
