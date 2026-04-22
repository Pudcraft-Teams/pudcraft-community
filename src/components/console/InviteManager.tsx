"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { defaultLocale, isLocale } from "@/i18n/config";
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

const EXPIRY_OPTION_KEYS: ReadonlyArray<{
  value: number;
  label: "expiry1h" | "expiry6h" | "expiry24h" | "expiry3d" | "expiry7d" | "expiry30d" | "expiryNever";
}> = [
  { value: 1, label: "expiry1h" },
  { value: 6, label: "expiry6h" },
  { value: 24, label: "expiry24h" },
  { value: 72, label: "expiry3d" },
  { value: 168, label: "expiry7d" },
  { value: 720, label: "expiry30d" },
  { value: 0, label: "expiryNever" },
];

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

function formatExpiry(
  expiresAt: string | null,
  t: ReturnType<typeof useTranslations>,
): string {
  if (!expiresAt) {
    return t("expiryNeverBadge");
  }

  const expiry = new Date(expiresAt);
  if (expiry.getTime() <= Date.now()) {
    return t("expiredBadge");
  }

  const diffMs = expiry.getTime() - Date.now();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return t("daysUntilExpiry", { days });
  }
  if (hours > 0) {
    return t("hoursUntilExpiry", { hours });
  }
  return t("aboutToExpire");
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) {
    return false;
  }
  return new Date(expiresAt).getTime() <= Date.now();
}

/**
 * Invite-code management component.
 * Supports creation, listing, copy link, and revocation of invite codes.
 */
export function InviteManager({ serverId, serverPsid }: InviteManagerProps) {
  const t = useTranslations("console.invites");
  const rawLocale = useLocale();
  const appLocale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const confirm = useConfirm();
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
        throw new Error(payload.error ?? t("loadFailed"));
      }

      setInvites(payload.data ?? []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : t("loadFailed");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [serverId, t]);

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
          throw new Error(payload.error ?? t("loadFailed"));
        }

        if (!cancelled) {
          setInvites(payload.data ?? []);
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
        throw new Error(payload.error ?? t("createFailed"));
      }

      setMaxUses("");
      setExpiresInHours(24);
      await fetchInvites();
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : t("createFailed");
      setError(message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevoke(code: string) {
    const confirmed = await confirm({
      title: t("revokeConfirmTitle"),
      message: t("revokeConfirmMessage"),
    });
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
          typeof errorPayload.error === "string" ? errorPayload.error : t("revokeFailed"),
        );
      }

      await fetchInvites();
    } catch (revokeError) {
      const message = revokeError instanceof Error ? revokeError.message : t("revokeFailed");
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
      <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>

      {error && (
        <div className="mt-3 rounded-lg border border-accent-hover/20 bg-accent-muted px-3 py-2 text-sm text-accent-hover">
          {error}
        </div>
      )}

      {/* Create invite form */}
      <div className="mt-4 rounded-xl border border-warm-200 bg-warm-50 p-4">
        <h3 className="text-sm font-medium text-warm-800">{t("createHeading")}</h3>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[120px]">
            <label htmlFor="invite-max-uses" className="block text-xs text-warm-500">
              {t("maxUsesLabel")}
            </label>
            <input
              id="invite-max-uses"
              type="number"
              min={1}
              max={1000}
              placeholder={t("maxUsesPlaceholder")}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className="m3-input mt-1 w-full"
            />
          </div>
          <div className="min-w-[140px]">
            <label htmlFor="invite-expiry" className="block text-xs text-warm-500">
              {t("expiryLabel")}
            </label>
            <select
              id="invite-expiry"
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="m3-input mt-1 w-full"
            >
              {EXPIRY_OPTION_KEYS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
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
              <LoadingSpinner size="sm" text={t("creating")} />
            ) : (
              t("createAction")
            )}
          </button>
        </div>
      </div>

      {/* Active invites list */}
      <div className="mt-4">
        <h3 className="text-sm font-medium text-warm-800">
          {t("activeHeading", { count: activeInvites.length })}
        </h3>

        {isLoading ? (
          <div className="mt-3 flex justify-center py-6">
            <LoadingSpinner text={t("loading")} />
          </div>
        ) : activeInvites.length === 0 ? (
          <p className="mt-3 text-sm text-warm-500">{t("emptyActive")}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {activeInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warm-200 bg-surface px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-warm-100 px-2 py-0.5 font-mono text-sm text-warm-800">
                      {invite.code}
                    </code>
                    <span className="text-xs text-warm-500">
                      {t("usageCount", {
                        used: invite.usedCount,
                        max: invite.maxUses ?? "\u221E",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-warm-500">
                    {invite.creatorName && (
                      <span>{t("creator", { name: invite.creatorName })}</span>
                    )}
                    <span>{formatExpiry(invite.expiresAt, t)}</span>
                    <span>{t("createdAgo", { time: timeAgo(invite.createdAt, appLocale) })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(invite.code)}
                    className="m3-btn rounded-lg border border-warm-200 bg-surface px-3 py-1.5 text-xs text-warm-800 transition-colors hover:bg-warm-50"
                  >
                    {copiedCode === invite.code ? t("copied") : t("copyAction")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(invite.code)}
                    disabled={revokingCode === invite.code}
                    className="m3-btn rounded-lg border border-accent-hover/20 bg-surface px-3 py-1.5 text-xs text-accent-hover transition-colors hover:bg-accent-muted"
                  >
                    {revokingCode === invite.code ? t("revoking") : t("revokeAction")}
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
            {t("expiredHeading", { count: expiredInvites.length })}
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
                      {t("usageCount", {
                        used: invite.usedCount,
                        max: invite.maxUses ?? "\u221E",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-warm-400">
                    {t("expiredSummary", { time: timeAgo(invite.createdAt, appLocale) })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevoke(invite.code)}
                  disabled={revokingCode === invite.code}
                  className="m3-btn rounded-lg border border-warm-200 bg-surface px-3 py-1.5 text-xs text-warm-500 transition-colors hover:bg-warm-50"
                >
                  {revokingCode === invite.code ? t("deleting") : t("deleteAction")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
