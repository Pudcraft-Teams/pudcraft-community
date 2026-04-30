"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { PageLoading } from "@/components/PageLoading";
import { UserAvatar } from "@/components/UserAvatar";
import type { AdminUserItem, PaginationInfo } from "@/lib/types";

type BannedFilter = "all" | "normal" | "banned";

const FILTER_TABS: { key: BannedFilter; labelKey: string }[] = [
  { key: "all", labelKey: "tabAll" },
  { key: "normal", labelKey: "tabNormal" },
  { key: "banned", labelKey: "tabBanned" },
];

export default function AdminUsersPage() {
  const t = useTranslations("admin.users");
  const confirm = useConfirm();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bannedFilter, setBannedFilter] = useState<BannedFilter>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [banningId, setBanningId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
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

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("banned", bannedFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error(t("loadFailed"));

      const json = (await res.json()) as {
        data: AdminUserItem[];
        pagination: PaginationInfo;
      };
      setUsers(json.data);
      setPagination(json.pagination);
    } catch {
      toast.error(t("loadListFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [page, bannedFilter, search, toast, t]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleBan = async (id: string) => {
    if (!banReason.trim()) {
      toast.error(t("banReasonRequired"));
      return;
    }

    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ban", reason: banReason.trim() }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? t("actionFailed"));
      }
      toast.success(t("banSuccess"));
      setBanningId(null);
      setBanReason("");
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnban = async (id: string) => {
    const ok = await confirm({
      title: t("unbanConfirmTitle"),
      message: t("unbanConfirmMessage"),
    });
    if (!ok) return;

    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unban" }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? t("actionFailed"));
      }
      toast.success(t("unbanSuccess"));
      await fetchUsers();
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
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-warm-700">{t("heading")}</h1>

      {/* Status filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setBannedFilter(tab.key);
              setPage(1);
            }}
            className={`m3-chip text-sm ${bannedFilter === tab.key ? "m3-chip-active" : ""}`}
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
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-sm text-warm-500">{t("empty")}</div>
      ) : (
        <>
          {/* User table */}
          <div className="m3-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-warm-200 text-xs text-warm-500">
                  <th className="px-4 py-3 font-medium">{t("colUser")}</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">{t("colMisskey")}</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">{t("colServers")}</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">{t("colComments")}</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">
                    {t("colCreatedAt")}
                  </th>
                  <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                  <th className="px-4 py-3 font-medium">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-warm-100 transition-colors last:border-0 hover:bg-warm-50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          src={user.image}
                          name={user.name}
                          handle={user.misskeyUsername}
                          className="h-7 w-7"
                          fallbackClassName="bg-gradient-to-br from-coral to-coral-amber text-white"
                        />
                        <span className="max-w-24 truncate font-medium text-warm-700">
                          {user.name || t("nameFallback")}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-500 sm:table-cell">
                      @{user.misskeyUsername}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-600 md:table-cell">
                      {user.serverCount}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-600 md:table-cell">
                      {user.commentCount}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-500 lg:table-cell">
                      {formatTimeAgo(user.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {user.isBanned ? (
                        <span
                          className="bg-coral-light text-coral-hover ring-coral-hover/20 inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1"
                          title={user.banReason ?? undefined}
                        >
                          {t("statusBanned")}
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-forest-light px-2 py-0.5 text-xs font-medium text-forest-dark ring-1 ring-forest-light">
                          {t("statusNormal")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {user.isBanned ? (
                          <button
                            type="button"
                            disabled={actionLoading === user.id}
                            onClick={() => handleUnban(user.id)}
                            className="rounded bg-forest-light px-2 py-1 text-xs font-medium text-forest-dark transition-colors hover:bg-forest-light/80 disabled:opacity-50"
                          >
                            {t("actionUnban")}
                          </button>
                        ) : user.role !== "admin" ? (
                          <button
                            type="button"
                            disabled={actionLoading === user.id}
                            onClick={() => {
                              setBanningId(user.id);
                              setBanReason("");
                            }}
                            className="bg-coral-light text-coral-hover hover:bg-coral-light/80 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {t("actionBan")}
                          </button>
                        ) : null}
                        <Link
                          href={`/u/${user.misskeyId}`}
                          className="rounded bg-warm-50 px-2 py-1 text-xs font-medium text-warm-600 transition-colors hover:bg-warm-100"
                        >
                          {t("actionView")}
                        </Link>
                      </div>

                      {/* Ban popover */}
                      {banningId === user.id && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            value={banReason}
                            onChange={(e) => setBanReason(e.target.value)}
                            placeholder={t("banPlaceholder")}
                            className="m3-input w-full text-xs"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={actionLoading === user.id}
                              onClick={() => handleBan(user.id)}
                              className="bg-coral-hover hover:bg-coral-hover/80 rounded px-2 py-1 text-xs text-white disabled:opacity-50"
                            >
                              {t("confirmBan")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setBanningId(null)}
                              className="rounded bg-warm-100 px-2 py-1 text-xs text-warm-600 hover:bg-warm-200"
                            >
                              {t("cancel")}
                            </button>
                          </div>
                        </div>
                      )}
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
