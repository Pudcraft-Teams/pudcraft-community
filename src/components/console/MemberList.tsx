"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { UserAvatar } from "@/components/UserAvatar";
import { timeAgo } from "@/lib/time";
import type { ServerMemberItem, SyncStatus } from "@/lib/types";

interface MemberListProps {
  serverId: string;
}

interface MembersResponse {
  members?: ServerMemberItem[];
  total?: number;
  page?: number;
  totalPages?: number;
  error?: string;
}

function parseMembersPayload(raw: unknown): MembersResponse {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    members: Array.isArray(payload.members) ? (payload.members as ServerMemberItem[]) : undefined,
    total: typeof payload.total === "number" ? payload.total : undefined,
    page: typeof payload.page === "number" ? payload.page : undefined,
    totalPages: typeof payload.totalPages === "number" ? payload.totalPages : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

function resolveJoinMethodLabel(
  joinedVia: "apply" | "invite",
  t: ReturnType<typeof useTranslations>,
): { label: string; className: string } {
  if (joinedVia === "apply") {
    return {
      label: t("joinMethodApply"),
      className: "bg-accent-muted text-accent ring-1 ring-accent/20",
    };
  }

  return {
    label: t("joinMethodInvite"),
    className: "bg-accent-muted text-accent-hover ring-1 ring-accent-hover/20",
  };
}

function resolveSyncIndicator(
  status: SyncStatus | null,
  t: ReturnType<typeof useTranslations>,
): {
  label: string;
  dotClassName: string;
  textClassName: string;
} {
  if (status === "acked") {
    return {
      label: t("syncAcked"),
      dotClassName: "bg-forest",
      textClassName: "text-forest",
    };
  }

  if (status === "pending" || status === "pushed") {
    return {
      label: t("syncPending"),
      dotClassName: "bg-accent-hover",
      textClassName: "text-accent-hover",
    };
  }

  if (status === "failed") {
    return {
      label: t("syncFailed"),
      dotClassName: "bg-accent-hover",
      textClassName: "text-accent-hover",
    };
  }

  return {
    label: t("syncNone"),
    dotClassName: "bg-warm-400",
    textClassName: "text-warm-500",
  };
}

/**
 * Server member list component.
 * Supports paginated viewing, sync-status indicator, and member removal.
 */
export function MemberList({ serverId }: MemberListProps) {
  const t = useTranslations("console.members");
  const confirm = useConfirm();
  const [members, setMembers] = useState<ServerMemberItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchMembers = useCallback(
    async (targetPage: number) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/servers/${serverId}/members?page=${targetPage}&limit=20`,
          { cache: "no-store" },
        );
        const payload = parseMembersPayload(await response.json().catch(() => ({})));

        if (!response.ok) {
          throw new Error(payload.error ?? t("loadFailed"));
        }

        setMembers(payload.members ?? []);
        setTotal(payload.total ?? 0);
        setPage(payload.page ?? targetPage);
        setTotalPages(payload.totalPages ?? 1);
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : t("loadFailed");
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [serverId, t],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/servers/${serverId}/members?page=1&limit=20`, {
          cache: "no-store",
        });
        const payload = parseMembersPayload(await response.json().catch(() => ({})));

        if (!response.ok) {
          throw new Error(payload.error ?? t("loadFailed"));
        }

        if (!cancelled) {
          setMembers(payload.members ?? []);
          setTotal(payload.total ?? 0);
          setPage(payload.page ?? 1);
          setTotalPages(payload.totalPages ?? 1);
        }
      } catch (fetchError) {
        if (!cancelled) {
          const message = fetchError instanceof Error ? fetchError.message : t("loadFailed");
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [serverId, t]);

  async function handleRemove(memberId: string) {
    const confirmed = await confirm({
      title: t("removeConfirmTitle"),
      message: t("removeConfirmMessage"),
      confirmText: t("removeAction"),
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    setRemovingId(memberId);
    setError(null);

    try {
      const response = await fetch(`/api/servers/${serverId}/members/${memberId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const errorPayload = payload as Record<string, unknown>;
        throw new Error(
          typeof errorPayload.error === "string" ? errorPayload.error : t("removeFailed"),
        );
      }

      await fetchMembers(page);
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : t("removeFailed");
      setError(message);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="m3-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>
        {total > 0 && (
          <span className="text-sm text-warm-500">{t("totalMembers", { count: total })}</span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-accent-hover/20 bg-accent-muted px-3 py-2 text-sm text-accent-hover">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="mt-4 flex justify-center py-8">
          <LoadingSpinner text={t("loading")} />
        </div>
      ) : members.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {members.map((member) => {
              const joinMethod = resolveJoinMethodLabel(member.joinedVia, t);
              const syncIndicator = resolveSyncIndicator(member.syncStatus, t);

              return (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warm-200 bg-surface px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      src={member.userImage}
                      name={member.userName}
                      className="h-10 w-10"
                      fallbackClassName="bg-accent text-white"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-warm-800">
                          {member.userName ?? t("userFallback")}
                        </span>
                        {member.mcUsername && (
                          <span className="rounded bg-warm-100 px-1.5 py-0.5 font-mono text-xs text-warm-500">
                            {member.mcUsername}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${joinMethod.className}`}
                        >
                          {joinMethod.label}
                        </span>
                        <span className="flex items-center gap-1 text-xs">
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${syncIndicator.dotClassName}`}
                          />
                          <span className={syncIndicator.textClassName}>
                            {syncIndicator.label}
                          </span>
                        </span>
                        <span className="text-xs text-warm-500">
                          {t("joinedAgo", { time: timeAgo(member.createdAt) })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemove(member.id)}
                    disabled={removingId === member.id}
                    className="m3-btn rounded-lg border border-accent-hover/20 bg-surface px-3 py-1.5 text-xs text-accent-hover transition-colors hover:bg-accent-muted"
                  >
                    {removingId === member.id ? t("removing") : t("removeAction")}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void fetchMembers(page - 1)}
                disabled={page <= 1 || isLoading}
                className="m3-btn rounded-lg border border-warm-200 bg-surface px-3 py-1.5 text-sm text-warm-800 transition-colors hover:bg-warm-50 disabled:opacity-40"
              >
                {t("pageNavPrev")}
              </button>
              <span className="text-sm text-warm-500">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => void fetchMembers(page + 1)}
                disabled={page >= totalPages || isLoading}
                className="m3-btn rounded-lg border border-warm-200 bg-surface px-3 py-1.5 text-sm text-warm-800 transition-colors hover:bg-warm-50 disabled:opacity-40"
              >
                {t("pageNavNext")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
