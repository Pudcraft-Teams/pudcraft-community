"use client";

import { useCallback, useEffect, useState } from "react";
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

function resolveJoinMethodLabel(joinedVia: "apply" | "invite"): { label: string; className: string } {
  if (joinedVia === "apply") {
    return {
      label: "申请加入",
      className: "bg-coral-light text-coral ring-1 ring-coral/20",
    };
  }

  return {
    label: "邀请加入",
    className: "bg-[#FDF5ED] text-coral-amber ring-1 ring-coral-amber/20",
  };
}

function resolveSyncIndicator(status: SyncStatus | null): {
  label: string;
  dotClassName: string;
  textClassName: string;
} {
  if (status === "acked") {
    return {
      label: "已同步",
      dotClassName: "bg-forest",
      textClassName: "text-forest",
    };
  }

  if (status === "pending" || status === "pushed") {
    return {
      label: "同步中",
      dotClassName: "bg-coral-amber",
      textClassName: "text-coral-amber",
    };
  }

  if (status === "failed") {
    return {
      label: "同步失败",
      dotClassName: "bg-coral-hover",
      textClassName: "text-coral-hover",
    };
  }

  return {
    label: "未同步",
    dotClassName: "bg-warm-400",
    textClassName: "text-warm-500",
  };
}

/**
 * 服务器成员列表组件。
 * 支持分页查看、同步状态指示和移除成员操作。
 */
export function MemberList({ serverId }: MemberListProps) {
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
          throw new Error(payload.error ?? "成员列表加载失败");
        }

        setMembers(payload.members ?? []);
        setTotal(payload.total ?? 0);
        setPage(payload.page ?? targetPage);
        setTotalPages(payload.totalPages ?? 1);
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : "成员列表加载失败";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [serverId],
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
          throw new Error(payload.error ?? "成员列表加载失败");
        }

        if (!cancelled) {
          setMembers(payload.members ?? []);
          setTotal(payload.total ?? 0);
          setPage(payload.page ?? 1);
          setTotalPages(payload.totalPages ?? 1);
        }
      } catch (fetchError) {
        if (!cancelled) {
          const message = fetchError instanceof Error ? fetchError.message : "成员列表加载失败";
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
  }, [serverId]);

  async function handleRemove(memberId: string) {
    const confirmed = window.confirm("确定要移除该成员吗？");
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
          typeof errorPayload.error === "string" ? errorPayload.error : "移除成员失败",
        );
      }

      await fetchMembers(page);
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : "移除成员失败";
      setError(message);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="m3-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-warm-800">成员管理</h2>
        {total > 0 && (
          <span className="text-sm text-warm-500">{total} 名成员</span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-coral-hover/20 bg-coral-light px-3 py-2 text-sm text-coral-hover">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="mt-4 flex justify-center py-8">
          <LoadingSpinner text="加载成员列表..." />
        </div>
      ) : members.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="暂无成员" description="还没有成员加入该服务器" />
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {members.map((member) => {
              const joinMethod = resolveJoinMethodLabel(member.joinedVia);
              const syncIndicator = resolveSyncIndicator(member.syncStatus);

              return (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warm-200 bg-[#FFFAF6] px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      src={member.userImage}
                      name={member.userName}
                      className="h-10 w-10"
                      fallbackClassName="bg-gradient-to-br from-coral to-coral-amber text-white"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-warm-800">
                          {member.userName ?? "未知用户"}
                        </span>
                        {member.mcUsername && (
                          <span className="rounded bg-warm-100 px-1.5 py-0.5 font-mono text-xs text-warm-600">
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
                          {timeAgo(member.createdAt)} 加入
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemove(member.id)}
                    disabled={removingId === member.id}
                    className="m3-btn rounded-lg border border-coral-hover/20 bg-[#FFFAF6] px-3 py-1.5 text-xs text-coral-hover transition-colors hover:bg-coral-light"
                  >
                    {removingId === member.id ? "移除中..." : "移除"}
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
                className="m3-btn rounded-lg border border-warm-200 bg-[#FFFAF6] px-3 py-1.5 text-sm text-warm-700 transition-colors hover:bg-warm-50 disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-sm text-warm-500">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => void fetchMembers(page + 1)}
                disabled={page >= totalPages || isLoading}
                className="m3-btn rounded-lg border border-warm-200 bg-[#FFFAF6] px-3 py-1.5 text-sm text-warm-700 transition-colors hover:bg-warm-50 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
