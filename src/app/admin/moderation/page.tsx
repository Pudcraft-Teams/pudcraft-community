"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/useToast";
import { PageLoading } from "@/components/PageLoading";
import type {
  AdminModerationLogItem,
  AdminModerationStats,
  PaginationInfo,
} from "@/lib/types";

type FilterKey = "failed" | "unreviewed" | "passed" | "all";
type TypeKey = "all" | "server" | "modpack" | "username" | "comment";

const FILTER_TABS: { key: FilterKey; labelKey: string }[] = [
  { key: "failed", labelKey: "tabFailed" },
  { key: "unreviewed", labelKey: "tabUnreviewed" },
  { key: "passed", labelKey: "tabPassed" },
  { key: "all", labelKey: "tabAll" },
];

const TYPE_TABS: { key: TypeKey; labelKey: string }[] = [
  { key: "all", labelKey: "typeAll" },
  { key: "server", labelKey: "typeServer" },
  { key: "modpack", labelKey: "typeModpack" },
  { key: "username", labelKey: "typeUsername" },
  { key: "comment", labelKey: "typeComment" },
];

const CONTENT_TYPE_LABEL_KEYS: Record<Exclude<TypeKey, "all">, string> = {
  server: "typeServer",
  modpack: "typeModpack",
  username: "typeUsername",
  comment: "typeComment",
};

export default function AdminModerationPage() {
  const t = useTranslations("admin.moderation");
  const { toast } = useToast();
  const [logs, setLogs] = useState<AdminModerationLogItem[]>([]);
  const [stats, setStats] = useState<AdminModerationStats | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("failed");
  const [type, setType] = useState<TypeKey>("all");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const formatTimeAgo = useCallback(
    (dateStr: string): string => {
      const diff = Date.now() - new Date(dateStr).getTime();
      const minutes = Math.floor(diff / 60_000);
      if (minutes < 60) return t("timeAgoMinutes", { count: minutes });
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return t("timeAgoHours", { count: hours });
      const days = Math.floor(hours / 24);
      return t("timeAgoDays", { count: days });
    },
    [t],
  );

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("filter", filter);
      params.set("type", type);

      const res = await fetch(`/api/admin/moderation?${params.toString()}`);
      if (!res.ok) throw new Error(t("loadFailed"));

      const json = (await res.json()) as {
        data: AdminModerationLogItem[];
        stats: AdminModerationStats;
        pagination: PaginationInfo;
      };
      setLogs(json.data);
      setStats(json.stats);
      setPagination(json.pagination);
    } catch {
      toast.error(t("loadListFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [page, filter, type, toast, t]);

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
        throw new Error(json.error ?? t("actionFailed"));
      }
      toast.success(t("markReviewedSuccess"));
      await fetchLogs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-warm-700">{t("heading")}</h1>

      {/* Stats cards */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="m3-surface p-4">
            <p className="text-sm text-warm-500">{t("stats7d")}</p>
            <p className="mt-1 text-3xl font-bold text-coral">{stats.total}</p>
          </div>
          <div className="m3-surface p-4">
            <p className="text-sm text-warm-500">{t("statsFailed")}</p>
            <p className="mt-1 text-3xl font-bold text-coral-hover">{stats.failed}</p>
          </div>
          <div className="m3-surface p-4">
            <p className="text-sm text-warm-500">{t("statsRate")}</p>
            <p className="mt-1 text-3xl font-bold text-coral-amber">
              {stats.total > 0 ? `${Math.round((stats.failed / stats.total) * 100)}%` : "—"}
            </p>
          </div>
          <div className="m3-surface p-4">
            <p className="text-sm text-warm-500">{t("statsUnreviewed")}</p>
            <p className="mt-1 text-3xl font-bold text-warm-800">{stats.unreviewed}</p>
          </div>
        </div>
      )}

      {/* Status filter */}
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
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Type filter */}
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
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageLoading />
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-sm text-warm-500">{t("empty")}</div>
      ) : (
        <>
          {/* Log table */}
          <div className="m3-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-warm-200 text-xs text-warm-500">
                  <th className="px-4 py-3 font-medium">{t("colTime")}</th>
                  <th className="px-4 py-3 font-medium">{t("colType")}</th>
                  <th className="px-4 py-3 font-medium">{t("colSnippet")}</th>
                  <th className="px-4 py-3 font-medium">{t("colResult")}</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    {t("colCategory")}
                  </th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">
                    {t("colReason")}
                  </th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">{t("colUser")}</th>
                  <th className="px-4 py-3 font-medium">{t("colActions")}</th>
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
                      {formatTimeAgo(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-md bg-warm-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                        {log.contentType in CONTENT_TYPE_LABEL_KEYS
                          ? t(
                              CONTENT_TYPE_LABEL_KEYS[
                                log.contentType as Exclude<TypeKey, "all">
                              ],
                            )
                          : log.contentType}
                      </span>
                    </td>
                    <td className="max-w-48 truncate px-4 py-3 text-xs text-warm-700">
                      {log.contentSnippet}
                    </td>
                    <td className="px-4 py-3">
                      {log.passed ? (
                        <span className="inline-block rounded-full bg-forest-light px-2 py-0.5 text-xs font-medium text-forest-dark ring-1 ring-forest-light">
                          {t("resultPassed")}
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-coral-light px-2 py-0.5 text-xs font-medium text-coral-hover ring-1 ring-coral-hover/20">
                          {t("resultFailed")}
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
                      {log.userName ?? log.userIp ?? t("userAnonymous")}
                    </td>
                    <td className="px-4 py-3">
                      {!log.passed && !log.reviewed ? (
                        <button
                          type="button"
                          disabled={actionLoading === log.id}
                          onClick={() => markReviewed(log.id)}
                          className="rounded bg-coral-light px-2 py-1 text-xs font-medium text-coral transition-colors hover:bg-coral-light/80 disabled:opacity-50"
                        >
                          {t("actionMarkReviewed")}
                        </button>
                      ) : log.reviewed ? (
                        <span className="text-xs text-warm-400">{t("statusReviewed")}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-warm-500">
              <span>
                {t("paginationSummary", {
                  total: pagination.total,
                  page: pagination.page,
                  totalPages: pagination.totalPages,
                })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="m3-btn m3-btn-tonal px-3 py-1 text-xs disabled:opacity-50"
                >
                  {t("paginationPrev")}
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="m3-btn m3-btn-tonal px-3 py-1 text-xs disabled:opacity-50"
                >
                  {t("paginationNext")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
