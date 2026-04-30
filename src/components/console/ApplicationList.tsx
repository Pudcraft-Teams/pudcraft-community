"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Pagination } from "@/components/Pagination";
import { UserAvatar } from "@/components/UserAvatar";
import { defaultLocale, isLocale } from "@/i18n/config";
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

const TAB_KEYS: TabStatus[] = ["pending", "approved", "rejected"];

function resolveTabLabel(tab: TabStatus, t: ReturnType<typeof useTranslations>): string {
  if (tab === "pending") return t("tabPending");
  if (tab === "approved") return t("tabApproved");
  return t("tabRejected");
}

function StatusBadge({
  status,
  t,
}: {
  status: ApplicationStatus;
  t: ReturnType<typeof useTranslations>;
}) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center rounded-full bg-accent-muted px-2.5 py-0.5 text-xs font-medium text-accent-hover ring-1 ring-accent-hover/20">
          {t("statusPending")}
        </span>
      );
    case "approved":
      return (
        <span className="inline-flex items-center rounded-full bg-forest-light px-2.5 py-0.5 text-xs font-medium text-forest-dark ring-1 ring-forest/20">
          {t("statusApproved")}
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center rounded-full bg-accent-muted px-2.5 py-0.5 text-xs font-medium text-accent-hover ring-1 ring-accent-hover/20">
          {t("statusRejected")}
        </span>
      );
    default:
      return null;
  }
}

function resolveUserName(
  app: ServerApplicationItem,
  t: ReturnType<typeof useTranslations>,
): string {
  return app.userName?.trim() || t("anonymousUser");
}

function EvaluationBadge({
  app,
  t,
  formData,
}: {
  app: ServerApplicationItem;
  t: ReturnType<typeof useTranslations>;
  formData: ServerApplicationItem["formData"];
}) {
  const result = app.evaluationResult;
  if (!result) {
    if (formData && Object.keys(formData).length > 0) {
      return (
        <span className="inline-flex items-center rounded-full bg-warm-100 px-2.5 py-0.5 text-xs font-medium text-warm-500">
          {t("badge.noEvaluation")}
        </span>
      );
    }
    return null;
  }

  if (result.result === "hard_disqualify") {
    const fieldLabel = result.offendingFieldKey ?? "";
    return (
      <span className="inline-flex items-center rounded-full bg-coral-light px-2.5 py-0.5 text-xs font-medium text-coral ring-1 ring-coral/20">
        {t("badge.hardDisqualify", { fieldLabel })}
      </span>
    );
  }

  if (result.result === "score_below_threshold") {
    return (
      <span className="inline-flex items-center rounded-full bg-coral-light px-2.5 py-0.5 text-xs font-medium text-coral ring-1 ring-coral/20">
        {t("badge.scoreBelowThreshold", {
          score: result.score ?? 0,
          passingScore: result.passingScore ?? 0,
        })}
      </span>
    );
  }

  // pending_review
  if (typeof result.score === "number" && typeof result.passingScore === "number") {
    return (
      <span className="inline-flex items-center rounded-full bg-forest-light px-2.5 py-0.5 text-xs font-medium text-forest-dark ring-1 ring-forest/20">
        {t("badge.passedAutoScreen", {
          score: result.score,
          passingScore: result.passingScore,
        })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-warm-100 px-2.5 py-0.5 text-xs font-medium text-warm-600">
      {t("badge.awaitingReview")}
    </span>
  );
}

/**
 * Application review list.
 * Owners can view and moderate (approve / reject) player join applications.
 */
export function ApplicationList({ serverId }: ApplicationListProps) {
  const t = useTranslations("console.applications");
  const rawLocale = useLocale();
  const appLocale = isLocale(rawLocale) ? rawLocale : defaultLocale;
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
          throw new Error(payload.error ?? t("loadFailed"));
        }

        setApplications(payload.data ?? []);
        setTotalPages(payload.totalPages ?? 1);
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : t("loadFailed");
        setError(message);
        setApplications([]);
      } finally {
        setIsLoading(false);
      }
    },
    [serverId, t],
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
        throw new Error(typeof body.error === "string" ? body.error : t("actionFailed"));
      }

      // Refresh list and pending count
      await Promise.all([fetchApplications(activeTab, page), fetchPendingCount()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("actionFailed");
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
        throw new Error(typeof body.error === "string" ? body.error : t("actionFailed"));
      }

      setRejectingId(null);
      setRejectNote("");

      // Refresh list and pending count
      await Promise.all([fetchApplications(activeTab, page), fetchPendingCount()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("actionFailed");
      setError(message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <section className="m3-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>

      {/* Status tabs */}
      <div className="mt-4 flex gap-1 border-b border-warm-200">
        {TAB_KEYS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabChange(tab)}
            className={`relative px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-accent text-accent"
                : "text-warm-500 hover:text-warm-800"
            }`}
          >
            {resolveTabLabel(tab, t)}
            {tab === "pending" && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-hover px-1.5 text-[11px] font-semibold text-white">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-accent-hover/20 bg-accent-muted px-4 py-2 text-sm text-accent-hover">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <p className="mt-6 text-center text-sm text-warm-500">{t("loading")}</p>
      ) : applications.length === 0 ? (
        <p className="mt-6 text-center text-sm text-warm-500">{t("empty")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {applications.map((app) => (
            <div
              key={app.id}
              className="rounded-xl border border-warm-200 bg-surface p-4 shadow-sm"
            >
              {/* Header: user info + status */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <UserAvatar
                    src={app.userImage}
                    name={app.userName}
                    className="h-10 w-10"
                    fallbackClassName="bg-accent text-white"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-warm-800">
                      {resolveUserName(app, t)}
                    </p>
                    {app.mcUsername && (
                      <p className="mt-0.5 text-xs text-warm-500">
                        {t("mcUsername")}
                        <span className="font-mono text-warm-800">{app.mcUsername}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <EvaluationBadge app={app} t={t} formData={app.formData} />
                  <StatusBadge status={app.status} t={t} />
                  <span className="text-xs text-warm-400">{timeAgo(app.createdAt, appLocale)}</span>
                </div>
              </div>

              {/* Form answers */}
              {app.formData && Object.keys(app.formData).length > 0 && (
                <div className="mt-3 space-y-1.5 rounded-lg bg-warm-50 p-3">
                  {Object.entries(app.formData).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-sm">
                      <span className="shrink-0 font-medium text-warm-500">{key}:</span>
                      <span className="text-warm-800">
                        {Array.isArray(value) ? value.join(", ") : value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Review note (for reviewed applications) */}
              {app.status !== "pending" && app.reviewNote && (
                <div className="mt-3 rounded-lg border border-warm-100 bg-warm-50 p-3 text-sm">
                  <span className="font-medium text-warm-500">{t("reviewNote")}</span>
                  <span className="text-warm-800">{app.reviewNote}</span>
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
                        placeholder={t("rejectNotePlaceholder")}
                        rows={2}
                        className="w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleReject(app.id)}
                          disabled={actionLoading === app.id}
                          className="rounded-lg bg-accent-hover px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-dark disabled:opacity-50"
                        >
                          {actionLoading === app.id ? t("processing") : t("rejectConfirm")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingId(null);
                            setRejectNote("");
                          }}
                          disabled={actionLoading === app.id}
                          className="rounded-lg border border-warm-200 bg-surface px-3 py-1.5 text-sm font-medium text-warm-500 transition-colors hover:bg-warm-50 disabled:opacity-50"
                        >
                          {t("cancelReject")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleApprove(app.id)}
                        disabled={actionLoading === app.id}
                        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                      >
                        {actionLoading === app.id ? t("processing") : t("approveAction")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingId(app.id)}
                        disabled={actionLoading !== null}
                        className="rounded-lg border border-accent-hover/20 bg-surface px-3 py-1.5 text-sm font-medium text-accent-hover transition-colors hover:bg-accent-muted disabled:opacity-50"
                      >
                        {t("rejectAction")}
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
