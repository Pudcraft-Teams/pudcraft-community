"use client";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { PageLoading } from "@/components/PageLoading";
import type { AdminServerItem, PaginationInfo } from "@/lib/types";

type StatusFilterKey =
  | "all"
  | "pending"
  | "unreviewed"
  | "reported"
  | "reviewed"
  | "rejected";

const STATUS_TABS: { key: StatusFilterKey; labelKey: string }[] = [
  { key: "all", labelKey: "tabAll" },
  { key: "pending", labelKey: "tabPending" },
  { key: "unreviewed", labelKey: "tabUnreviewed" },
  { key: "reported", labelKey: "tabReported" },
  { key: "reviewed", labelKey: "tabReviewed" },
  { key: "rejected", labelKey: "tabRejected" },
];

export default function AdminServersPage() {
  const t = useTranslations("admin.servers");
  const confirm = useConfirm();
  const { toast } = useToast();
  const [servers, setServers] = useState<AdminServerItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [ownerInputId, setOwnerInputId] = useState<string | null>(null);
  const [ownerInput, setOwnerInput] = useState("");

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

  const renderStatusBadge = useCallback(
    (status: string) => {
      switch (status) {
        case "pending":
          return (
            <span className="inline-block rounded-full bg-accent-hover/10 px-2 py-0.5 text-xs font-medium text-accent-hover ring-1 ring-accent-hover/20">
              {t("statusPending")}
            </span>
          );
        case "approved":
          return (
            <span className="inline-block rounded-full bg-forest-light px-2 py-0.5 text-xs font-medium text-forest-dark ring-1 ring-forest-light">
              {t("statusApproved")}
            </span>
          );
        case "rejected":
          return (
            <span className="inline-block rounded-full bg-accent-muted px-2 py-0.5 text-xs font-medium text-accent-hover ring-1 ring-accent-hover/20">
              {t("statusRejected")}
            </span>
          );
        default:
          return null;
      }
    },
    [t],
  );

  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("status", statusFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/servers?${params.toString()}`);
      if (!res.ok) throw new Error(t("loadFailed"));

      const json = (await res.json()) as {
        data: AdminServerItem[];
        pagination: PaginationInfo;
      };
      setServers(json.data);
      setPagination(json.pagination);
    } catch {
      toast.error(t("loadListFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, search, toast, t]);

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
        throw new Error(json.error ?? t("actionFailed"));
      }
      toast.success(t("approveSuccess"));
      await fetchServers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) {
      toast.error(t("rejectReasonRequired"));
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
        throw new Error(json.error ?? t("actionFailed"));
      }
      toast.success(t("rejectSuccess"));
      setRejectingId(null);
      setRejectReason("");
      await fetchServers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t("deleteConfirmTitle"),
      message: t("deleteConfirmMessage", { name }),
      confirmText: t("deleteConfirmAction"),
      danger: true,
    });
    if (!ok) {
      return;
    }

    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/servers/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? t("deleteFailed"));
      }
      toast.success(t("deleteSuccess"));
      await fetchServers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReview = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/servers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review" }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? t("actionFailed"));
      }
      toast.success(t("reviewedSuccess"));
      await fetchServers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleVerified = async (id: string, currentValue: boolean) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/servers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVerified: !currentValue }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? t("actionFailed"));
      }
      toast.success(t("verifySuccess"));
      await fetchServers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetOwner = async (id: string) => {
    const trimmed = ownerInput.trim();
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/servers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: trimmed || null }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? t("actionFailed"));
      }
      toast.success(t("ownerSuccess"));
      setOwnerInputId(null);
      setOwnerInput("");
      await fetchServers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
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
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-warm-800">{t("heading")}</h1>

      {/* Status filter tabs */}
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
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6 flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="m3-input flex-1"
        />
        <button type="submit" className="m3-btn m3-btn-tonal">
          {t("searchSubmit")}
        </button>
      </form>

      {isLoading ? (
        <PageLoading />
      ) : servers.length === 0 ? (
        <div className="py-12 text-center text-sm text-warm-400">{t("empty")}</div>
      ) : (
        <>
          {/* Server table */}
          <div className="m3-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-warm-200 text-xs text-warm-400">
                  <th className="px-4 py-3 font-medium">{t("colName")}</th>
                  <th className="px-4 py-3 font-medium">{t("colAddress")}</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    {t("colSubmitter")}
                  </th>
                  <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">
                    {t("colVerified")}
                  </th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">
                    {t("colSubmittedAt")}
                  </th>
                  <th className="px-4 py-3 font-medium">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => (
                  <Fragment key={server.id}>
                  <tr
                    className="border-b border-warm-100 transition-colors last:border-0 hover:bg-warm-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Image
                          src={server.iconUrl || "/default-server-icon.png"}
                          alt={t("iconAlt", { name: server.name })}
                          width={28}
                          height={28}
                          className="rounded"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(expandedId === server.id ? null : server.id)
                          }
                          className="max-w-32 truncate font-medium text-warm-800 underline decoration-warm-300 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
                          title={t("toggleDetails")}
                        >
                          {server.name}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-warm-400">
                      {server.host}
                      {server.port !== 25565 ? `:${server.port}` : ""}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <span className="text-xs text-warm-500">
                        {server.ownerName || (server.ownerHandle ? `@${server.ownerHandle}` : "—")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {renderStatusBadge(server.status)}
                      {server.status === "rejected" && server.rejectReason && (
                        <p
                          className="mt-1 max-w-52 truncate text-xs text-accent-hover"
                          title={server.rejectReason}
                        >
                          {t("rejectReasonPrefix", { reason: server.rejectReason })}
                        </p>
                      )}
                      {statusFilter === "reported" && server.reportCount && (
                        <span className="ml-2 inline-block rounded-full bg-accent-hover/10 px-2 py-0.5 text-xs text-accent-hover">
                          {t("reportCount", { count: server.reportCount })}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span
                        className={`text-xs ${
                          server.isVerified ? "font-medium text-accent" : "text-warm-400"
                        }`}
                      >
                        {server.isVerified ? t("verifiedTrue") : t("verifiedFalse")}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-400 lg:table-cell">
                      {formatTimeAgo(server.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {server.status !== "approved" && (
                          <button
                            type="button"
                            disabled={actionLoading === server.id}
                            onClick={() => handleApprove(server.id)}
                            className="rounded bg-forest-light px-2 py-1 text-xs font-medium text-forest-dark transition-colors hover:bg-forest-light/80 disabled:opacity-50"
                          >
                            {t("actionApprove")}
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
                            className="rounded bg-accent-hover/10 px-2 py-1 text-xs font-medium text-accent-hover transition-colors hover:bg-accent-hover/20 disabled:opacity-50"
                          >
                            {t("actionReject")}
                          </button>
                        )}
                        {statusFilter === "unreviewed" && (
                          <button
                            type="button"
                            disabled={actionLoading === server.id}
                            onClick={() => handleReview(server.id)}
                            className="rounded bg-forest-light px-2 py-1 text-xs font-medium text-forest-dark transition-colors hover:bg-forest-light/80 disabled:opacity-50"
                          >
                            {t("actionMarkReviewed")}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={actionLoading === server.id}
                          onClick={() => handleDelete(server.id, server.name)}
                          className="rounded bg-accent-muted px-2 py-1 text-xs font-medium text-accent-hover transition-colors hover:bg-accent-muted/80 disabled:opacity-50"
                        >
                          {t("actionDelete")}
                        </button>
                      </div>

                      {/* Reject popover */}
                      {rejectingId === server.id && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder={t("rejectPlaceholder")}
                            className="m3-input w-full text-xs"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={actionLoading === server.id}
                              onClick={() => handleReject(server.id)}
                              className="rounded bg-accent-hover px-2 py-1 text-xs text-white hover:bg-accent-hover/80 disabled:opacity-50"
                            >
                              {t("confirmReject")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectingId(null)}
                              className="rounded bg-warm-100 px-2 py-1 text-xs text-warm-500 hover:bg-warm-200"
                            >
                              {t("cancel")}
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Expanded details row */}
                  {expandedId === server.id && (
                    <tr className="bg-warm-50">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="space-y-3 text-sm">
                          <div>
                            <span className="font-medium text-warm-800">
                              {t("detailDescriptionLabel")}
                            </span>
                            <span className="text-warm-500">
                              {server.description || t("detailEmpty")}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium text-warm-800">
                              {t("detailContentLabel")}
                            </span>
                            {server.content ? (
                              <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-warm-200 bg-surface p-3 text-xs text-warm-500">
                                {server.content}
                              </pre>
                            ) : (
                              <span className="text-warm-500">{t("detailEmpty")}</span>
                            )}
                          </div>
                          {/* Admin controls: isVerified toggle + ownerId assignment */}
                          <div className="flex flex-wrap items-start gap-4 border-t border-warm-200 pt-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={actionLoading === server.id}
                                onClick={() => handleToggleVerified(server.id, server.isVerified)}
                                className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                  server.isVerified
                                    ? "bg-accent-muted text-accent-hover hover:bg-accent-muted/80"
                                    : "bg-forest-light text-forest-dark hover:bg-forest-light/80"
                                }`}
                              >
                                {server.isVerified ? t("actionUnverify") : t("actionVerify")}
                              </button>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-medium text-warm-600">{t("ownerInputLabel")}</span>
                              {ownerInputId === server.id ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={ownerInput}
                                    onChange={(e) => setOwnerInput(e.target.value)}
                                    placeholder={t("ownerPlaceholder")}
                                    className="m3-input w-48 text-xs"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    disabled={actionLoading === server.id}
                                    onClick={() => handleSetOwner(server.id)}
                                    className="rounded bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-50"
                                  >
                                    {t("actionSetOwner")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setOwnerInputId(null); setOwnerInput(""); }}
                                    className="rounded bg-warm-100 px-2 py-1 text-xs text-warm-500 hover:bg-warm-200"
                                  >
                                    {t("cancel")}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setOwnerInputId(server.id); setOwnerInput(server.ownerId ?? ""); }}
                                  className="self-start rounded bg-warm-100 px-2 py-1 text-xs text-warm-600 hover:bg-warm-200"
                                >
                                  {server.ownerId ? `${t("ownerLabel")}: ${server.ownerId}` : t("actionSetOwner")}
                                </button>
                              )}
                            </div>
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

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-warm-400">
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
