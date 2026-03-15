"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { timeAgo } from "@/lib/time";
import type { ServerInviteItem } from "@/lib/types";

interface InviteManagerProps {
  serverId: string;
  serverPsid: number;
}

interface InvitesResponse {
  data?: ServerInviteItem[];
  error?: string;
}

interface CreateInviteResponse {
  success?: boolean;
  data?: {
    id: string;
    code: string;
    url: string;
    maxUses: number | null;
    usedCount: number;
    expiresAt: string | null;
    createdAt: string;
  };
  error?: string;
}

const EXPIRY_OPTIONS = [
  { label: "1 小时", value: 1 },
  { label: "6 小时", value: 6 },
  { label: "24 小时", value: 24 },
  { label: "3 天", value: 72 },
  { label: "7 天", value: 168 },
  { label: "30 天", value: 720 },
  { label: "永不过期", value: 0 },
] as const;

function parseInvitesPayload(raw: unknown): InvitesResponse {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    data: Array.isArray(payload.data) ? (payload.data as ServerInviteItem[]) : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

function parseCreateResponse(raw: unknown): CreateInviteResponse {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    success: typeof payload.success === "boolean" ? payload.success : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) {
    return "永不过期";
  }

  const expiry = new Date(expiresAt);
  if (expiry.getTime() <= Date.now()) {
    return "已过期";
  }

  const diffMs = expiry.getTime() - Date.now();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} 天后过期`;
  }
  if (hours > 0) {
    return `${hours} 小时后过期`;
  }
  return "即将过期";
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }
  return new Date(expiresAt).getTime() <= Date.now();
}

/**
 * 邀请码管理组件。
 * 支持创建、查看、复制链接和撤销邀请码。
 */
export function InviteManager({ serverId, serverPsid }: InviteManagerProps) {
  const [invites, setInvites] = useState<ServerInviteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [revokingCode, setRevokingCode] = useState<string | null>(null);

  // Form state
  const [maxUses, setMaxUses] = useState<string>("");
  const [expiresInHours, setExpiresInHours] = useState<number>(24);

  const fetchInvites = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/servers/${serverId}/invites`, {
        cache: "no-store",
      });
      const payload = parseInvitesPayload(await response.json().catch(() => ({})));

      if (!response.ok) {
        throw new Error(payload.error ?? "邀请码加载失败");
      }

      setInvites(payload.data ?? []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "邀请码加载失败";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/servers/${serverId}/invites`, {
          cache: "no-store",
        });
        const payload = parseInvitesPayload(await response.json().catch(() => ({})));

        if (!response.ok) {
          throw new Error(payload.error ?? "邀请码加载失败");
        }

        if (!cancelled) {
          setInvites(payload.data ?? []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          const message = fetchError instanceof Error ? fetchError.message : "邀请码加载失败";
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

  async function handleCreate() {
    setIsCreating(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {};
      const parsedMaxUses = maxUses.trim() ? Number.parseInt(maxUses, 10) : null;
      if (parsedMaxUses !== null && Number.isFinite(parsedMaxUses) && parsedMaxUses > 0) {
        body.maxUses = parsedMaxUses;
      }
      if (expiresInHours > 0) {
        body.expiresInHours = expiresInHours;
      }

      const response = await fetch(`/api/servers/${serverId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = parseCreateResponse(await response.json().catch(() => ({})));

      if (!response.ok) {
        throw new Error(payload.error ?? "创建邀请码失败");
      }

      setMaxUses("");
      setExpiresInHours(24);
      await fetchInvites();
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "创建邀请码失败";
      setError(message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevoke(code: string) {
    const confirmed = window.confirm("确定要撤销该邀请码吗？撤销后将无法使用。");
    if (!confirmed) {
      return;
    }

    setRevokingCode(code);
    setError(null);

    try {
      const response = await fetch(`/api/servers/${serverId}/invites/${code}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const errorPayload = payload as Record<string, unknown>;
        throw new Error(
          typeof errorPayload.error === "string" ? errorPayload.error : "撤销邀请码失败",
        );
      }

      await fetchInvites();
    } catch (revokeError) {
      const message = revokeError instanceof Error ? revokeError.message : "撤销邀请码失败";
      setError(message);
    } finally {
      setRevokingCode(null);
    }
  }

  function handleCopy(code: string) {
    const url = `${window.location.origin}/servers/${serverPsid}/join/${code}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => {
        setCopiedCode(null);
      }, 2000);
    });
  }

  const activeInvites = invites.filter((invite) => !isExpired(invite.expiresAt));
  const expiredInvites = invites.filter((invite) => isExpired(invite.expiresAt));

  return (
    <section className="m3-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-warm-800">邀请码管理</h2>

      {error && (
        <div className="mt-3 rounded-lg border border-coral-hover/20 bg-coral-light px-3 py-2 text-sm text-coral-hover">
          {error}
        </div>
      )}

      {/* Create invite form */}
      <div className="mt-4 rounded-xl border border-warm-200 bg-warm-50 p-4">
        <h3 className="text-sm font-medium text-warm-700">创建邀请码</h3>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[120px]">
            <label htmlFor="invite-max-uses" className="block text-xs text-warm-500">
              最大使用次数
            </label>
            <input
              id="invite-max-uses"
              type="number"
              min={1}
              max={1000}
              placeholder="不限"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="m3-input mt-1 w-full"
            />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="invite-expiry" className="block text-xs text-warm-500">
              有效期
            </label>
            <select
              id="invite-expiry"
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="m3-input mt-1 w-full"
            >
              {EXPIRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isCreating}
            className="m3-btn m3-btn-primary"
          >
            {isCreating ? (
              <LoadingSpinner size="sm" text="创建中..." />
            ) : (
              "创建邀请码"
            )}
          </button>
        </div>
      </div>

      {/* Active invites list */}
      <div className="mt-4">
        <h3 className="text-sm font-medium text-warm-700">
          有效邀请码 ({activeInvites.length})
        </h3>

        {isLoading ? (
          <div className="mt-3 flex justify-center py-6">
            <LoadingSpinner text="加载中..." />
          </div>
        ) : activeInvites.length === 0 ? (
          <p className="mt-3 text-sm text-warm-500">暂无有效邀请码</p>
        ) : (
          <div className="mt-3 space-y-2">
            {activeInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warm-200 bg-[#FFFAF6] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-warm-100 px-2 py-0.5 font-mono text-sm text-warm-800">
                      {invite.code}
                    </code>
                    <span className="text-xs text-warm-500">
                      {invite.usedCount}/{invite.maxUses ?? "\u221E"} 次使用
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-warm-500">
                    {invite.creatorName && <span>创建者: {invite.creatorName}</span>}
                    <span>{formatExpiry(invite.expiresAt)}</span>
                    <span>{timeAgo(invite.createdAt)} 创建</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(invite.code)}
                    className="m3-btn rounded-lg border border-warm-200 bg-[#FFFAF6] px-3 py-1.5 text-xs text-warm-700 transition-colors hover:bg-warm-50"
                  >
                    {copiedCode === invite.code ? "已复制 \u2713" : "复制链接"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(invite.code)}
                    disabled={revokingCode === invite.code}
                    className="m3-btn rounded-lg border border-coral-hover/20 bg-[#FFFAF6] px-3 py-1.5 text-xs text-coral-hover transition-colors hover:bg-coral-light"
                  >
                    {revokingCode === invite.code ? "撤销中..." : "撤销"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expired invites (collapsed) */}
      {expiredInvites.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-warm-500">
            已过期 ({expiredInvites.length})
          </h3>
          <div className="mt-2 space-y-2 opacity-60">
            {expiredInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warm-100 bg-warm-50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-warm-100 px-2 py-0.5 font-mono text-sm text-warm-500 line-through">
                      {invite.code}
                    </code>
                    <span className="text-xs text-warm-400">
                      {invite.usedCount}/{invite.maxUses ?? "\u221E"} 次使用
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-warm-400">
                    已过期 · {timeAgo(invite.createdAt)} 创建
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevoke(invite.code)}
                  disabled={revokingCode === invite.code}
                  className="m3-btn rounded-lg border border-warm-200 bg-[#FFFAF6] px-3 py-1.5 text-xs text-warm-500 transition-colors hover:bg-warm-50"
                >
                  {revokingCode === invite.code ? "删除中..." : "删除"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
