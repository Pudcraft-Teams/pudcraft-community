"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/useToast";
import { PageLoading } from "@/components/PageLoading";
import { UserAvatar } from "@/components/UserAvatar";
import type { AdminUserItem, PaginationInfo } from "@/lib/types";

const FILTER_TABS = [
  { key: "all", label: "全部" },
  { key: "normal", label: "正常" },
  { key: "banned", label: "已封禁" },
] as const;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export default function AdminUsersPage() {
  const confirm = useConfirm();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bannedFilter, setBannedFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [banningId, setBanningId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      params.set("banned", bannedFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error("加载失败");

      const json = (await res.json()) as {
        data: AdminUserItem[];
        pagination: PaginationInfo;
      };
      setUsers(json.data);
      setPagination(json.pagination);
    } catch {
      toast.error("加载用户列表失败");
    } finally {
      setIsLoading(false);
    }
  }, [page, bannedFilter, search, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleBan = async (id: string) => {
    if (!banReason.trim()) {
      toast.error("请填写封禁原因");
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
        throw new Error(json.error ?? "操作失败");
      }
      toast.success("用户已封禁");
      setBanningId(null);
      setBanReason("");
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnban = async (id: string) => {
    const ok = await confirm({
      title: "解封确认",
      message: "确定要解封该用户吗？",
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
        throw new Error(json.error ?? "操作失败");
      }
      toast.success("用户已解封");
      await fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
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
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-warm-700">用户管理</h1>

      {/* 状态筛选 */}
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
          placeholder="搜索用户名或邮箱..."
          className="m3-input flex-1"
        />
        <button type="submit" className="m3-btn m3-btn-tonal">
          搜索
        </button>
      </form>

      {isLoading ? (
        <PageLoading />
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-sm text-warm-500">暂无数据</div>
      ) : (
        <>
          {/* 用户表格 */}
          <div className="m3-surface overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-warm-200 text-xs text-warm-500">
                  <th className="px-4 py-3 font-medium">用户</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">邮箱</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">服务器</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">评论</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">注册时间</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">操作</th>
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
                          email={user.email}
                          className="h-7 w-7"
                          fallbackClassName="bg-gradient-to-br from-coral to-coral-amber text-white"
                        />
                        <span className="max-w-24 truncate font-medium text-warm-700">
                          {user.name || "未设置"}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-500 sm:table-cell">
                      {user.email}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-600 md:table-cell">
                      {user.serverCount}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-600 md:table-cell">
                      {user.commentCount}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-warm-500 lg:table-cell">
                      {timeAgo(user.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {user.isBanned ? (
                        <span
                          className="inline-block rounded-full bg-coral-light px-2 py-0.5 text-xs font-medium text-coral-hover ring-1 ring-coral-hover/20"
                          title={user.banReason ?? undefined}
                        >
                          已封禁
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-forest-light px-2 py-0.5 text-xs font-medium text-forest-dark ring-1 ring-forest-light">
                          正常
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
                            解封
                          </button>
                        ) : user.role !== "admin" ? (
                          <button
                            type="button"
                            disabled={actionLoading === user.id}
                            onClick={() => {
                              setBanningId(user.id);
                              setBanReason("");
                            }}
                            className="rounded bg-coral-light px-2 py-1 text-xs font-medium text-coral-hover transition-colors hover:bg-coral-light/80 disabled:opacity-50"
                          >
                            封禁
                          </button>
                        ) : null}
                        <Link
                          href={`/user/${user.uid}`}
                          className="rounded bg-warm-50 px-2 py-1 text-xs font-medium text-warm-600 transition-colors hover:bg-warm-100"
                        >
                          查看
                        </Link>
                      </div>

                      {/* 封禁弹出 */}
                      {banningId === user.id && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            value={banReason}
                            onChange={(e) => setBanReason(e.target.value)}
                            placeholder="填写封禁原因..."
                            className="m3-input w-full text-xs"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              disabled={actionLoading === user.id}
                              onClick={() => handleBan(user.id)}
                              className="rounded bg-coral-hover px-2 py-1 text-xs text-white hover:bg-coral-hover/80 disabled:opacity-50"
                            >
                              确认封禁
                            </button>
                            <button
                              type="button"
                              onClick={() => setBanningId(null)}
                              className="rounded bg-warm-100 px-2 py-1 text-xs text-warm-600 hover:bg-warm-200"
                            >
                              取消
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

          {/* 分页 */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-warm-500">
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
