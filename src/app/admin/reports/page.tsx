"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useToast } from "@/hooks/useToast";
import { timeAgo } from "@/lib/time";
import { PageLoading } from "@/components/PageLoading";
import { defaultLocale, isLocale } from "@/i18n/config";

type StatusKey = "pending" | "resolved" | "dismissed" | "all";
type TargetTypeKey = "all" | "server" | "comment" | "user";
type CategoryKey = "misinformation" | "pornography" | "harassment" | "fraud" | "other";
type ActionKey = "warn" | "takedown" | "ban_user";

const STATUS_TABS: { key: StatusKey; labelKey: string }[] = [
  { key: "pending", labelKey: "statusPendingLabel" },
  { key: "resolved", labelKey: "statusResolvedLabel" },
  { key: "dismissed", labelKey: "statusDismissedLabel" },
  { key: "all", labelKey: "statusAllLabel" },
];

const TYPE_TABS: { key: TargetTypeKey; labelKey: string }[] = [
  { key: "all", labelKey: "typeAll" },
  { key: "server", labelKey: "typeServer" },
  { key: "comment", labelKey: "typeComment" },
  { key: "user", labelKey: "typeUser" },
];

const CATEGORY_LABEL_KEYS: Record<CategoryKey, string> = {
  misinformation: "categoryMisinformation",
  pornography: "categoryPornography",
  harassment: "categoryHarassment",
  fraud: "categoryFraud",
  other: "categoryOther",
};

const TARGET_TYPE_LABEL_KEYS: Record<Exclude<TargetTypeKey, "all">, string> = {
  server: "typeServer",
  comment: "typeComment",
  user: "typeUser",
};

const ACTION_OPTIONS: { key: ActionKey; labelKey: string }[] = [
  { key: "warn", labelKey: "actionWarn" },
  { key: "takedown", labelKey: "actionTakedown" },
  { key: "ban_user", labelKey: "actionBanUser" },
];

interface ReportReporter {
  id: string;
  name: string | null;
  misskeyUsername: string;
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
  const t = useTranslations("admin.reports");
  const rawLocale = useLocale();
  const appLocale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<StatusKey>("pending");
  const [targetType, setTargetType] = useState<TargetTypeKey>("all");
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
      if (!res.ok) throw new Error(t("loadFailed"));

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
      toast.error(t("loadListFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [page, status, targetType, toast, t]);

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
        throw new Error(json.error ?? t("actionFailed"));
      }
      toast.success(t("dismissSuccess"));
      await fetchReports();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
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
        throw new Error(json.error ?? t("actionFailed"));
      }
      toast.success(t("resolveSuccess"));
      closeProcessDialog();
      await fetchReports();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
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
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-warm-700">{t("heading")}</h1>

      {/* Stats cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-2">
        <div className="m3-surface p-4">
          <p className="text-sm text-warm-500">{t("statsPending")}</p>
          <p className="mt-1 text-3xl font-bold text-coral">{pendingCount}</p>
        </div>
        <div className="m3-surface p-4">
          <p className="text-sm text-warm-500">{t("statsCurrent")}</p>
          <p className="mt-1 text-3xl font-bold text-warm-800">{totalCount}</p>
        </div>
      </div>

      {/* Status filter */}
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
              setTargetType(tab.key);
              setPage(1);
            }}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              targetType === tab.key
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
      ) : reports.length === 0 ? (
        <div className="py-12 text-center text-sm text-warm-500">{t("empty")}</div>
      ) : (
        <>
          {/* Report table */}
          <div className="m3-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-warm-200 text-xs text-warm-500">
                  <th className="px-4 py-3 font-medium">{t("colTime")}</th>
                  <th className="px-4 py-3 font-medium">{t("colType")}</th>
                  <th className="px-4 py-3 font-medium">{t("colCategory")}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">
                    {t("colDescription")}
                  </th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    {t("colReporter")}
                  </th>
                  <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                  <th className="px-4 py-3 font-medium">{t("colActions")}</th>
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
                      {timeAgo(report.createdAt, appLocale)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-md bg-warm-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                        {report.targetType in TARGET_TYPE_LABEL_KEYS
                          ? t(
                              TARGET_TYPE_LABEL_KEYS[
                                report.targetType as Exclude<TargetTypeKey, "all">
                              ],
                            )
                          : report.targetType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-md bg-warm-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                        {report.category in CATEGORY_LABEL_KEYS
                          ? t(CATEGORY_LABEL_KEYS[report.category as CategoryKey])
                          : report.category}
                      </span>
                    </td>
                    <td className="hidden max-w-48 truncate px-4 py-3 text-xs text-warm-700 sm:table-cell">
                      {report.description ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-600 md:table-cell">
                      {report.reporter.name ?? `@${report.reporter.misskeyUsername}`}
                    </td>
                    <td className="px-4 py-3">
                      {report.status === "pending" ? (
                        <span className="inline-block rounded-full bg-coral-light px-2 py-0.5 text-xs font-medium text-coral-hover ring-1 ring-coral-hover/20">
                          {t("statusPendingLabel")}
                        </span>
                      ) : report.status === "resolved" ? (
                        <span className="inline-block rounded-full bg-forest-light px-2 py-0.5 text-xs font-medium text-forest-dark ring-1 ring-forest-light">
                          {t("statusResolvedLabel")}
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-warm-100 px-2 py-0.5 text-xs font-medium text-warm-500 ring-1 ring-warm-200">
                          {t("statusDismissedLabel")}
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
                            {t("actionDismiss")}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading === report.id}
                            onClick={() => openProcessDialog(report.id)}
                            className="rounded bg-coral-light px-2 py-1 text-xs font-medium text-coral transition-colors hover:bg-coral-light/80 disabled:opacity-50"
                          >
                            {t("actionResolve")}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-warm-400">
                          {report.status === "resolved"
                            ? t("statusResolvedLabel")
                            : t("statusDismissedLabel")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-warm-500">
              <span>
                {t("paginationSummary", { total: totalCount, page, totalPages })}
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
                  disabled={page >= totalPages}
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

      {/* Processing dialog */}
      {processingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="m3-surface mx-4 w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-semibold text-warm-700">{t("dialogTitle")}</h3>

            <div className="mb-4">
              <p className="mb-2 text-sm font-medium text-warm-600">
                {t("dialogActionsHeading")}
              </p>
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
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="admin-note" className="mb-1 block text-sm font-medium text-warm-600">
                {t("dialogNoteLabel")}
              </label>
              <textarea
                id="admin-note"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm text-warm-700 outline-none transition-colors focus:border-coral focus:ring-1 focus:ring-coral"
                placeholder={t("dialogNotePlaceholder")}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeProcessDialog}
                className="rounded-lg px-4 py-2 text-sm text-warm-600 transition-colors hover:bg-warm-100"
              >
                {t("dialogCancel")}
              </button>
              <button
                type="button"
                disabled={actionLoading === processingId}
                onClick={resolveReport}
                className="rounded-lg bg-coral px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-coral-hover disabled:opacity-50"
              >
                {t("dialogConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
