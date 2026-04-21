"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageLoading } from "@/components/PageLoading";

// ─── Types ─────────────────────────────────────

type ClaimMethod = "motd" | "plugin";

interface VerifyState {
  isVerified: boolean;
  verifyToken: string | null;
  verifyExpiresAt: string | null;
  verifiedAt: string | null;
  ownerId: string | null;
  isCurrentOwner: boolean;
  hasOwner: boolean;
  isTokenOwnedByCurrentUser: boolean;
  hasPendingClaimByOtherUser: boolean;
}

interface ClaimKeyState {
  hasClaimKey: boolean;
  isClaimKeyExpired: boolean;
  expiresAt: string | null;
  hasPendingClaimByOtherUser: boolean;
}

// ─── Helpers ───────────────────────────────────

function safeParse<T>(raw: unknown, key: string): T | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  return (raw as Record<string, unknown>)[key] as T | undefined;
}

function safeStr(raw: unknown, key: string): string | null {
  const v = safeParse<unknown>(raw, key);
  return typeof v === "string" ? v : null;
}

function safeBool(raw: unknown, key: string): boolean {
  return safeParse<unknown>(raw, key) === true;
}

function splitRemainingTime(remainingMs: number): { minutes: number; seconds: string } {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return { minutes, seconds: String(seconds).padStart(2, "0") };
}

function formatDateTime(dateString: string | null): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

// ─── Component ─────────────────────────────────

/**
 * 服务器认领页面（合并 MOTD 认领 + 插件认领两种方式）。
 */
export default function ServerVerifyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { status: sessionStatus } = useSession();
  const t = useTranslations("servers.verify");
  const tMotd = useTranslations("servers.verify.motd");
  const tPlugin = useTranslations("servers.verify.plugin");
  const tCommon = useTranslations("servers.common");
  const formatRemainingTime = useCallback(
    (remainingMs: number) => {
      const { minutes, seconds } = splitRemainingTime(remainingMs);
      return t("motd.remainingUnit", { minutes, seconds });
    },
    [t],
  );

  // ── 共享状态 ──
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [serverName, setServerName] = useState("");
  const [activeTab, setActiveTab] = useState<ClaimMethod>("motd");
  const [tick, setTick] = useState(() => Date.now());
  const [apiUrl, setApiUrl] = useState(
    () => process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "",
  );
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  // ── MOTD 状态 ──
  const [verifyState, setVerifyState] = useState<VerifyState>({
    isVerified: false,
    verifyToken: null,
    verifyExpiresAt: null,
    verifiedAt: null,
    ownerId: null,
    isCurrentOwner: false,
    hasOwner: false,
    isTokenOwnedByCurrentUser: false,
    hasPendingClaimByOtherUser: false,
  });
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [motdMessage, setMotdMessage] = useState<string | null>(null);
  const [motdError, setMotdError] = useState<string | null>(null);

  // ── 插件认领状态 ──
  const [claimKey, setClaimKey] = useState<ClaimKeyState>({
    hasClaimKey: false,
    isClaimKeyExpired: true,
    expiresAt: null,
    hasPendingClaimByOtherUser: false,
  });
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);

  // ── 数据加载 ──

  const fetchVerifyStatus = useCallback(async (): Promise<boolean> => {
    const res = await fetch(`/api/servers/${id}/verify`, { cache: "no-store" });
    const data: unknown = await res.json().catch(() => ({}));

    if (res.status === 401) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/verify`)}`);
      return false;
    }
    if (res.status === 404) {
      setPageError(t("notFoundOrDeleted"));
      return false;
    }
    if (!res.ok) {
      setPageError(safeStr(data, "error") ?? t("loadFailed"));
      return false;
    }

    const name = safeStr(data, "serverName");
    if (name) setServerName(name);

    setVerifyState({
      isVerified: safeBool(data, "isVerified"),
      verifyToken: safeStr(data, "verifyToken"),
      verifyExpiresAt: safeStr(data, "verifyExpiresAt"),
      verifiedAt: safeStr(data, "verifiedAt"),
      ownerId: safeStr(data, "ownerId"),
      isCurrentOwner: safeBool(data, "isCurrentOwner"),
      hasOwner: safeBool(data, "hasOwner"),
      isTokenOwnedByCurrentUser: safeBool(data, "isTokenOwnedByCurrentUser"),
      hasPendingClaimByOtherUser: safeBool(data, "hasPendingClaimByOtherUser"),
    });
    return true;
  }, [id, router, t]);

  const fetchClaimKeyStatus = useCallback(async (): Promise<boolean> => {
    const res = await fetch(`/api/servers/${id}/verify/claim-key`, { cache: "no-store" });
    if (!res.ok) return false;
    const data: unknown = await res.json().catch(() => ({}));

    // 同步 isVerified 到 verifyState
    if (safeBool(data, "isVerified")) {
      setVerifyState((prev) => ({
        ...prev,
        isVerified: true,
        verifiedAt: safeStr(data, "verifiedAt") ?? prev.verifiedAt,
        isCurrentOwner: safeBool(data, "isCurrentOwner") || prev.isCurrentOwner,
      }));
    }

    setClaimKey({
      hasClaimKey: safeBool(data, "hasClaimKey"),
      isClaimKeyExpired: safeBool(data, "isClaimKeyExpired"),
      expiresAt: safeStr(data, "expiresAt"),
      hasPendingClaimByOtherUser: safeBool(data, "hasPendingClaimByOtherUser"),
    });
    return true;
  }, [id]);

  // ── Effects ──

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/verify`)}`);
    }
  }, [id, router, sessionStatus]);

  useEffect(() => {
    if (!apiUrl && typeof window !== "undefined") {
      setApiUrl(window.location.origin);
    }
  }, [apiUrl]);

  // 初始化加载两个状态
  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      if (sessionStatus !== "loading") setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setPageError(null);
      try {
        const ok = await fetchVerifyStatus();
        if (ok && !cancelled) await fetchClaimKeyStatus();
      } catch {
        if (!cancelled) setPageError(t("loadFailedRetry"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchVerifyStatus, fetchClaimKeyStatus, sessionStatus, t]);

  // 倒计时 tick
  useEffect(() => {
    const hasMotdTimer = activeTab === "motd" && !!verifyState.verifyExpiresAt;
    const hasPluginTimer = activeTab === "plugin" && !!claimKey.expiresAt;
    if (!hasMotdTimer && !hasPluginTimer) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeTab, verifyState.verifyExpiresAt, claimKey.expiresAt]);

  // 插件 tab 轮询
  useEffect(() => {
    if (activeTab !== "plugin" || !claimKey.hasClaimKey || claimKey.isClaimKeyExpired || verifyState.isVerified) return;
    const poll = window.setInterval(() => {
      void fetchClaimKeyStatus();
    }, 5000);
    return () => window.clearInterval(poll);
  }, [activeTab, claimKey.hasClaimKey, claimKey.isClaimKeyExpired, verifyState.isVerified, fetchClaimKeyStatus]);

  // ── Computed ──

  const motdExpiresAtTs = useMemo(() => {
    if (!verifyState.verifyExpiresAt) return null;
    const ts = new Date(verifyState.verifyExpiresAt).getTime();
    return Number.isNaN(ts) ? null : ts;
  }, [verifyState.verifyExpiresAt]);

  const motdRemainingMs = useMemo(() => (motdExpiresAtTs ? motdExpiresAtTs - tick : 0), [motdExpiresAtTs, tick]);
  const isMotdTokenExpired = !!motdExpiresAtTs && motdRemainingMs <= 0;

  const pluginExpiresAtTs = useMemo(() => {
    if (!claimKey.expiresAt) return null;
    const ts = new Date(claimKey.expiresAt).getTime();
    return Number.isNaN(ts) ? null : ts;
  }, [claimKey.expiresAt]);

  const pluginRemainingMs = useMemo(() => (pluginExpiresAtTs ? pluginExpiresAtTs - tick : 0), [pluginExpiresAtTs, tick]);
  const isPluginKeyExpired = !!pluginExpiresAtTs && pluginRemainingMs <= 0;

  const verifiedAtLabel = formatDateTime(verifyState.verifiedAt);
  const isVerifiedByCurrentUser = verifyState.isVerified && verifyState.isCurrentOwner;
  const isManagedByAnotherUser = verifyState.hasOwner && !verifyState.isCurrentOwner;

  // ── Handlers ──

  const handleCopy = async (field: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedField(null);
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      if (activeTab === "motd") setMotdError(tMotd("copyFailed"));
      else setPluginError(tPlugin("copyFailed"));
    }
  };

  // MOTD: 生成验证码
  const handleGenerateToken = async () => {
    setIsGeneratingToken(true);
    setMotdMessage(null);
    setMotdError(null);

    try {
      const res = await fetch(`/api/servers/${id}/verify`, { method: "POST" });
      const data: unknown = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/verify`)}`);
        return;
      }
      if (res.status === 403) {
        setMotdError(safeStr(data, "error") ?? safeStr(data, "message") ?? tMotd("forbidden"));
        return;
      }
      if (!res.ok) {
        setMotdError(safeStr(data, "error") ?? safeStr(data, "message") ?? tMotd("generateFailed"));
        return;
      }
      if (safeBool(data, "isVerified")) {
        setVerifyState((prev) => ({
          ...prev,
          isVerified: true,
          verifiedAt: safeStr(data, "verifiedAt") ?? prev.verifiedAt,
          verifyToken: null,
          verifyExpiresAt: null,
        }));
        setMotdMessage(safeStr(data, "message") ?? tMotd("alreadyClaimed"));
        return;
      }

      const ok = await fetchVerifyStatus();
      if (ok) {
        const instruction = safeStr(data, "instruction") ?? tMotd("defaultInstruction");
        const ownerMsg = safeStr(data, "currentOwner");
        setMotdMessage([ownerMsg, instruction].filter((s): s is string => !!s).join(" "));
      }
    } catch {
      setMotdError(tMotd("networkError"));
    } finally {
      setIsGeneratingToken(false);
    }
  };

  // MOTD: 触发验证
  const handleVerify = async () => {
    if (!verifyState.verifyToken || isMotdTokenExpired) return;
    setIsVerifying(true);
    setMotdMessage(null);
    setMotdError(null);

    try {
      const res = await fetch(`/api/servers/${id}/verify`, { method: "PATCH" });
      const data: unknown = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/verify`)}`);
        return;
      }
      if (res.status === 403) {
        setMotdError(safeStr(data, "error") ?? safeStr(data, "reason") ?? tMotd("tokenNotYours"));
        return;
      }
      if (!res.ok) {
        setMotdError(safeStr(data, "reason") ?? safeStr(data, "error") ?? tMotd("genericError"));
        return;
      }
      if (safeBool(data, "success") && safeBool(data, "verified")) {
        setMotdMessage(safeStr(data, "message") ?? tMotd("defaultSuccess"));
        await fetchVerifyStatus();
        return;
      }
      setMotdError(safeStr(data, "reason") ?? safeStr(data, "message") ?? tMotd("genericError"));
    } catch {
      setMotdError(tMotd("verifyNetworkError"));
    } finally {
      setIsVerifying(false);
    }
  };

  // 插件: 生成认领密钥
  const handleGenerateKey = async () => {
    setIsGeneratingKey(true);
    setPluginError(null);
    setGeneratedKey(null);

    try {
      const res = await fetch(`/api/servers/${id}/verify/claim-key`, { method: "POST" });
      const data: unknown = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/verify`)}`);
        return;
      }
      if (res.status === 409) {
        setPluginError(safeStr(data, "error") ?? tPlugin("conflict"));
        return;
      }
      if (!res.ok) {
        setPluginError(safeStr(data, "error") ?? tPlugin("generateFailed"));
        return;
      }

      setGeneratedKey(safeStr(data, "claimKey"));
      await fetchClaimKeyStatus();
      // 生成认领密钥会清除 MOTD token，同步一下
      await fetchVerifyStatus();
    } catch {
      setPluginError(tPlugin("networkError"));
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // ── Render ──

  if (sessionStatus === "loading" || isLoading) return <PageLoading />;

  if (sessionStatus === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-warm-400">{tCommon("redirectingToLogin")}</div>;
  }

  if (pageError) {
    return <div className="m3-alert-error mx-auto max-w-2xl px-4 py-3">{pageError}</div>;
  }

  const displayServerName = serverName || t("serverFallback");

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4">
      <nav className="flex items-center gap-2 text-sm text-warm-400">
        <Link href={`/servers/${id}`} className="m3-link">
          &larr; {t("backToDetail")}
        </Link>
      </nav>

      <section className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-warm-800">{t("heading", { name: displayServerName })}</h1>
        <p className="mt-2 text-sm text-warm-500">{t("description")}</p>

        {isManagedByAnotherUser && (
          <div className="m3-alert-error mt-4">{t("anotherOwnerNotice")}</div>
        )}

        {/* ── 已认领成功 ── */}
        {isVerifiedByCurrentUser ? (
          <div className="mt-6 space-y-4">
            <div className="m3-alert-success">
              <p className="font-medium">{t("ownedByYou")}</p>
              {verifiedAtLabel && (
                <p className="mt-1 text-xs">
                  {t("verifiedAtLabel")}
                  <span suppressHydrationWarning>{verifiedAtLabel}</span>
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Link href={`/servers/${id}`} className="m3-btn m3-btn-primary inline-flex">
                {t("backToDetail")}
              </Link>
              <Link href={`/console/${id}`} className="m3-btn m3-btn-tonal inline-flex">
                {t("goConsole")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* ── Tab 切换 ── */}
            <div className="mt-6 flex gap-1 rounded-xl bg-warm-100 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("motd")}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "motd"
                    ? "bg-surface text-warm-800 shadow-sm"
                    : "text-warm-400 hover:text-warm-500"
                }`}
              >
                {t("tabMotd")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("plugin")}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "plugin"
                    ? "bg-surface text-warm-800 shadow-sm"
                    : "text-warm-400 hover:text-warm-500"
                }`}
              >
                {t("tabPlugin")}
              </button>
            </div>

            {/* ── MOTD 认领 ── */}
            {activeTab === "motd" && (
              <div className="mt-5 space-y-5">
                {verifyState.hasPendingClaimByOtherUser && !verifyState.isTokenOwnedByCurrentUser && (
                  <div className="rounded-xl border border-accent-hover bg-accent-hover px-4 py-3 text-sm text-accent-hover">
                    {tMotd("conflictHint")}
                  </div>
                )}

                {!verifyState.verifyToken && (
                  <div className="space-y-4">
                    <div className="m3-surface-soft p-4">
                      <p className="text-sm font-medium text-warm-800">{tMotd("stepsHeading")}</p>
                      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-warm-500">
                        <li>{tMotd("step1")}</li>
                        <li>{tMotd("step2")}</li>
                        <li>{tMotd("step3")}</li>
                        <li>{tMotd("step4")}</li>
                      </ol>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateToken}
                      disabled={isGeneratingToken}
                      className="m3-btn m3-btn-primary"
                    >
                      {isGeneratingToken ? tMotd("generatingBtn") : tMotd("generateBtn")}
                    </button>
                  </div>
                )}

                {verifyState.verifyToken && (
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-sm font-medium text-warm-800">{tMotd("tokenHeading")}</p>
                      <div className="m3-surface-soft flex items-center justify-between gap-3 px-4 py-3">
                        <code className="break-all font-mono text-sm text-warm-800">
                          {verifyState.verifyToken}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy("motd-token", verifyState.verifyToken!)}
                          className="m3-btn m3-btn-tonal shrink-0 px-3 py-1.5 text-xs"
                        >
                          {copiedField === "motd-token" ? tMotd("copied") : tMotd("copy")}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-800">
                      <p>{tMotd("configTitle")}</p>
                      <p className="mt-2 font-mono text-xs text-warm-500">
                        {tMotd("configExample", { token: verifyState.verifyToken })}
                      </p>
                      <p className="mt-3 text-xs text-warm-400">{tMotd("configNote")}</p>
                    </div>

                    {isMotdTokenExpired ? (
                      <p className="text-sm text-accent-hover">{tMotd("expired")}</p>
                    ) : (
                      <p className="text-sm text-warm-500" suppressHydrationWarning>
                        {tMotd("remainingTime", { time: formatRemainingTime(motdRemainingMs) })}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateToken}
                        disabled={isGeneratingToken}
                        className="m3-btn m3-btn-tonal"
                      >
                        {isGeneratingToken ? tMotd("generatingBtn") : tMotd("regenerate")}
                      </button>
                      <button
                        type="button"
                        onClick={handleVerify}
                        disabled={isVerifying || isMotdTokenExpired || isGeneratingToken}
                        className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isVerifying ? tMotd("verifying") : tMotd("startVerify")}
                      </button>
                    </div>

                    {isVerifying && (
                      <p className="text-sm text-warm-400">{tMotd("verifyingNote")}</p>
                    )}
                  </div>
                )}

                {motdMessage && <div className="m3-alert-success">{motdMessage}</div>}

                {motdError && (
                  <div className="m3-alert-error space-y-2">
                    <p className="font-medium">{tMotd("verifyFailedTitle")}</p>
                    <p>{tMotd("verifyFailedReason", { reason: motdError })}</p>
                    <p className="text-xs text-accent-hover">{tMotd("verifyFailedChecklist")}</p>
                    {verifyState.verifyToken && !isMotdTokenExpired && (
                      <button
                        type="button"
                        onClick={handleVerify}
                        className="m3-btn m3-btn-tonal px-3 py-1.5 text-xs"
                      >
                        {tMotd("retryVerify")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── 插件认领 ── */}
            {activeTab === "plugin" && (
              <div className="mt-5 space-y-5">
                {claimKey.hasPendingClaimByOtherUser && (
                  <div className="rounded-xl border border-accent-hover bg-accent-hover px-4 py-3 text-sm text-accent-hover">
                    {tPlugin("conflictHint")}
                  </div>
                )}

                <div className="m3-surface-soft p-4">
                  <p className="text-sm font-medium text-warm-800">{tPlugin("stepsHeading")}</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-warm-500">
                    <li>{tPlugin("step1")}</li>
                    <li>{tPlugin("step2")}</li>
                    <li>{tPlugin("step3")}</li>
                    <li>{tPlugin("step4")}</li>
                  </ol>
                  <p className="mt-3 text-xs text-warm-400">{tPlugin("ipNote")}</p>
                </div>

                {/* 服务器 ID */}
                <div>
                  <p className="mb-2 text-sm font-medium text-warm-800">{tPlugin("serverIdHeading")}</p>
                  <div className="m3-surface-soft flex items-center justify-between gap-3 px-4 py-3">
                    <code className="font-mono text-sm text-warm-800">{id}</code>
                    <button
                      type="button"
                      onClick={() => handleCopy("server-id", id)}
                      className="m3-btn m3-btn-tonal shrink-0 px-3 py-1.5 text-xs"
                    >
                      {copiedField === "server-id" ? tPlugin("copied") : tPlugin("copy")}
                    </button>
                  </div>
                </div>

                {/* 刚生成的密钥 */}
                {generatedKey && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-warm-800">{tPlugin("keyHeading")}</p>
                    <div className="m3-surface-soft flex items-center justify-between gap-3 px-4 py-3">
                      <code className="break-all font-mono text-sm text-warm-800">
                        {generatedKey}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy("claim-key", generatedKey)}
                        className="m3-btn m3-btn-tonal shrink-0 px-3 py-1.5 text-xs"
                      >
                        {copiedField === "claim-key" ? tPlugin("copied") : tPlugin("copy")}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-accent-hover">{tPlugin("keyHint")}</p>
                  </div>
                )}

                {/* 已有密钥但刷新了页面 */}
                {!generatedKey && claimKey.hasClaimKey && !isPluginKeyExpired && (
                  <div className="rounded-xl border border-accent bg-accent-muted px-4 py-3 text-sm text-accent">
                    <p className="font-medium">{tPlugin("keyGenerated")}</p>
                    <p className="mt-1">{tPlugin("keyWaiting")}</p>
                  </div>
                )}

                {/* 倒计时 */}
                {claimKey.hasClaimKey && !isPluginKeyExpired && (
                  <p className="text-sm text-warm-500" suppressHydrationWarning>
                    {tPlugin("remainingTime", { time: formatRemainingTime(pluginRemainingMs) })}
                  </p>
                )}

                {/* 过期 */}
                {claimKey.hasClaimKey && isPluginKeyExpired && (
                  <p className="text-sm text-accent-hover">{tPlugin("expired")}</p>
                )}

                {/* 生成按钮 */}
                <button
                  type="button"
                  onClick={handleGenerateKey}
                  disabled={isGeneratingKey}
                  className="m3-btn m3-btn-primary"
                >
                  {isGeneratingKey
                    ? tPlugin("generating")
                    : claimKey.hasClaimKey
                      ? tPlugin("regenerate")
                      : tPlugin("generate")}
                </button>

                {/* 配置示例 */}
                {(generatedKey || (claimKey.hasClaimKey && !isPluginKeyExpired)) && (
                  <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-800">
                    <p className="font-medium">{tPlugin("configExampleTitle")}</p>
                <pre className="mt-2 overflow-x-auto whitespace-pre rounded-lg bg-warm-100 p-3 font-mono text-xs text-warm-500">
{`# config.yml
server-id: "${id}"
api-key: "${generatedKey ?? tPlugin("configKeyFallback")}"
api-url: "${apiUrl || tPlugin("configUrlFallback")}"
`}
                </pre>
                  </div>
                )}

                {pluginError && <div className="m3-alert-error">{pluginError}</div>}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
