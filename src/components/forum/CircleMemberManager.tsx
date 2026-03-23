"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { UserAvatar } from "@/components/UserAvatar";
import { timeAgo } from "@/lib/time";
import type { CircleMemberItem, CircleRoleType } from "@/lib/types";

interface CircleMemberManagerProps {
  circleId: string;
  /** Current user's role in this circle */
  currentUserRole: CircleRoleType;
}

interface MembersResponse {
  members?: CircleMemberItem[];
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
    members: Array.isArray(payload.members) ? (payload.members as CircleMemberItem[]) : undefined,
    total: typeof payload.total === "number" ? payload.total : undefined,
    page: typeof payload.page === "number" ? payload.page : undefined,
    totalPages: typeof payload.totalPages === "number" ? payload.totalPages : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

function resolveRoleBadge(role: CircleRoleType): { label: string; className: string } {
  if (role === "OWNER") {
    return {
      label: "圈主",
      className: "bg-coral-light text-coral-dark ring-1 ring-coral-light",
    };
  }

  if (role === "ADMIN") {
    return {
      label: "管理员",
      className: "bg-accent-muted text-accent ring-1 ring-accent/20",
    };
  }

  return {
    label: "成员",
    className: "bg-warm-100 text-warm-500 ring-1 ring-warm-200",
  };
}

/**
 * 圈子成员管理组件。
 * 支持分页查看成员列表、修改角色和移除成员。
 */
export function CircleMemberManager({ circleId, currentUserRole }: CircleMemberManagerProps) {
  const confirm = useConfirm();
  const [members, setMembers] = useState<CircleMemberItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionId, setActionId] = useState<string | null>(null);

  const isOwner = currentUserRole === "OWNER";
  const isAdmin = currentUserRole === "ADMIN";

  const fetchMembers = useCallback(
    async (targetPage: number) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/circles/${circleId}/members?page=${targetPage}&limit=20`,
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
    [circleId],
  );

  useEffect(() => {
    void fetchMembers(1);
  }, [fetchMembers]);

  const handleKick = useCallback(
    async (userId: string) => {
      const confirmed = await confirm({
        title: "移除成员",
        message: "确定要移除该成员吗？",
        confirmText: "移除",
        danger: true,
      });
      if (!confirmed) {
        return;
      }

      setActionId(userId);
      setError(null);

      try {
        const response = await fetch(`/api/circles/${circleId}/members/${userId}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const result: unknown = await response.json().catch(() => ({}));
          const payload = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
          throw new Error(typeof payload.error === "string" ? payload.error : "移除成员失败");
        }

        await fetchMembers(page);
      } catch (kickError) {
        const message = kickError instanceof Error ? kickError.message : "移除成员失败";
        setError(message);
      } finally {
        setActionId(null);
      }
    },
    [circleId, confirm, fetchMembers, page],
  );

  const handleChangeRole = useCallback(
    async (userId: string, newRole: "ADMIN" | "MEMBER") => {
      setActionId(userId);
      setError(null);

      try {
        const response = await fetch(`/api/circles/${circleId}/members/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        });

        if (!response.ok) {
          const result: unknown = await response.json().catch(() => ({}));
          const payload = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
          throw new Error(typeof payload.error === "string" ? payload.error : "修改角色失败");
        }

        await fetchMembers(page);
      } catch (roleError) {
        const message = roleError instanceof Error ? roleError.message : "修改角色失败";
        setError(message);
      } finally {
        setActionId(null);
      }
    },
    [circleId, fetchMembers, page],
  );

  /** Whether the current user can perform actions on a given member */
  function canManageMember(memberRole: CircleRoleType): boolean {
    if (memberRole === "OWNER") {
      return false;
    }
    if (isOwner) {
      return true;
    }
    if (isAdmin && memberRole === "MEMBER") {
      return true;
    }
    return false;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-warm-800">成员管理</h3>
        {total > 0 && (
          <span className="text-xs text-warm-500">{total} 名成员</span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-accent-hover/20 bg-accent-muted px-3 py-2 text-sm text-accent-hover">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="mt-4 flex justify-center py-8">
          <LoadingSpinner text="加载成员列表..." />
        </div>
      ) : members.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="暂无成员" description="还没有成员加入该圈子" />
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {members.map((member) => {
              const roleBadge = resolveRoleBadge(member.role);
              const canManage = canManageMember(member.role);
              const isActing = actionId === member.userId;

              return (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warm-200 bg-surface px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      src={member.user.image}
                      name={member.user.name}
                      className="h-10 w-10"
                      fallbackClassName="bg-accent text-white"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-warm-800">
                          {member.user.name ?? "未知用户"}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadge.className}`}
                        >
                          {roleBadge.label}
                        </span>
                      </div>
                      <span className="mt-0.5 block text-xs text-warm-500">
                        {timeAgo(member.joinedAt)} 加入
                      </span>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 gap-2">
                      {/* Role change (OWNER only) */}
                      {isOwner && member.role !== "OWNER" && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleChangeRole(
                              member.userId,
                              member.role === "ADMIN" ? "MEMBER" : "ADMIN",
                            )
                          }
                          disabled={isActing}
                          className="rounded-lg border border-warm-200 bg-surface px-3 py-1.5 text-xs text-warm-600 transition-colors hover:bg-warm-50"
                        >
                          {isActing
                            ? "处理中..."
                            : member.role === "ADMIN"
                              ? "降为成员"
                              : "设为管理员"}
                        </button>
                      )}

                      {/* Kick */}
                      <button
                        type="button"
                        onClick={() => void handleKick(member.userId)}
                        disabled={isActing}
                        className="rounded-lg border border-accent-hover/20 bg-surface px-3 py-1.5 text-xs text-accent-hover transition-colors hover:bg-accent-muted"
                      >
                        {isActing ? "移除中..." : "移除"}
                      </button>
                    </div>
                  )}
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
                上一页
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
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
