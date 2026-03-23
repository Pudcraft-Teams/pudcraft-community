"use client";

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

function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
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

  // ── 共享状态 ──
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [serverName, setServerName] = useState("该服务器");
  const [activeTab, setActiveTab] = useState<ClaimMethod>("motd");
  const [tick, setTick] = useState(() => Date.now());
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
      setPageError("服务器不存在或已被删除");
      return false;
    }
    if (!res.ok) {
      setPageError(safeStr(data, "error") ?? "加载认领状态失败");
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
  }, [id, router]);

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
        if (!cancelled) setPageError("加载认领状态失败，请稍后重试");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchVerifyStatus, fetchClaimKeyStatus, sessionStatus]);

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
      if (activeTab === "motd") setMotdError("复制失败，请手动复制");
      else setPluginError("复制失败，请手动复制");
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
        setMotdError(safeStr(data, "error") ?? safeStr(data, "message") ?? "无权限操作");
        return;
      }
      if (!res.ok) {
        setMotdError(safeStr(data, "error") ?? safeStr(data, "message") ?? "获取验证码失败");
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
        setMotdMessage(safeStr(data, "message") ?? "服务器已认领，无需重复验证");
        return;
      }

      const ok = await fetchVerifyStatus();
      if (ok) {
        const instruction = safeStr(data, "instruction") ?? "验证码已生成，请将其写入 MOTD 后开始验证";
        const ownerMsg = safeStr(data, "currentOwner");
        setMotdMessage([ownerMsg, instruction].filter((s): s is string => !!s).join(" "));
      }
    } catch {
      setMotdError("网络异常，获取验证码失败");
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
        setMotdError(safeStr(data, "error") ?? safeStr(data, "reason") ?? "该验证码不属于当前账号");
        return;
      }
      if (!res.ok) {
        setMotdError(safeStr(data, "reason") ?? safeStr(data, "error") ?? "验证未通过");
        return;
      }
      if (safeBool(data, "success") && safeBool(data, "verified")) {
        setMotdMessage(safeStr(data, "message") ?? "验证通过！你的服务器已获得认领标识。");
        await fetchVerifyStatus();
        return;
      }
      setMotdError(safeStr(data, "reason") ?? safeStr(data, "message") ?? "验证未通过");
    } catch {
      setMotdError("网络异常，验证失败");
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
        setPluginError(safeStr(data, "error") ?? "服务器已被认领");
        return;
      }
      if (!res.ok) {
        setPluginError(safeStr(data, "error") ?? "生成失败，请稍后重试");
        return;
      }

      setGeneratedKey(safeStr(data, "claimKey"));
      await fetchClaimKeyStatus();
      // 生成认领密钥会清除 MOTD token，同步一下
      await fetchVerifyStatus();
    } catch {
      setPluginError("网络异常，生成失败");
    } finally {
      setIsGeneratingKey(false);
    }
  };

  // ── Render ──

  if (sessionStatus === "loading" || isLoading) return <PageLoading />;

  if (sessionStatus === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-warm-400">正在跳转到登录页...</div>;
  }

  if (pageError) {
    return <div className="m3-alert-error mx-auto max-w-2xl px-4 py-3">{pageError}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4">
      <nav className="flex items-center gap-2 text-sm text-warm-400">
        <Link href={`/servers/${id}`} className="m3-link">
          &larr; 返回服务器详情
        </Link>
      </nav>

      <section className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-warm-800">认领服务器「{serverName}」</h1>
        <p className="mt-2 text-sm text-warm-500">
          认领通过后你将成为该服务器管理员，并获得「已认领」标识。
        </p>

        {isManagedByAnotherUser && (
          <div className="m3-alert-error mt-4">
            该服务器已被其他用户认领。你可以通过验证服务器所有权来重新认领。
          </div>
        )}

        {/* ── 已认领成功 ── */}
        {isVerifiedByCurrentUser ? (
          <div className="mt-6 space-y-4">
            <div className="m3-alert-success">
              <p className="font-medium">该服务器已由你认领。</p>
              {verifiedAtLabel && <p className="mt-1 text-xs">验证时间：{verifiedAtLabel}</p>}
            </div>
            <div className="flex gap-2">
              <Link href={`/servers/${id}`} className="m3-btn m3-btn-primary inline-flex">
                返回服务器详情
              </Link>
              <Link href={`/console/${id}`} className="m3-btn m3-btn-tonal inline-flex">
                前往控制台
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
                MOTD 认领
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
                插件认领
              </button>
            </div>

            {/* ── MOTD 认领 ── */}
            {activeTab === "motd" && (
              <div className="mt-5 space-y-5">
                {verifyState.hasPendingClaimByOtherUser && !verifyState.isTokenOwnedByCurrentUser && (
                  <div className="rounded-xl border border-accent-hover bg-accent-hover px-4 py-3 text-sm text-accent-hover">
                    当前已有其他用户在认领该服务器。你重新获取验证码会覆盖之前的认领流程。
                  </div>
                )}

                {!verifyState.verifyToken && (
                  <div className="space-y-4">
                    <div className="m3-surface-soft p-4">
                      <p className="text-sm font-medium text-warm-800">认领步骤：</p>
                      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-warm-500">
                        <li>点击下方按钮获取验证码</li>
                        <li>将验证码添加到 server.properties 的 motd= 行</li>
                        <li>重启服务器使 MOTD 生效，然后回到本页点击「开始验证」</li>
                        <li>验证通过后可移除 MOTD 中的验证码</li>
                      </ol>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateToken}
                      disabled={isGeneratingToken}
                      className="m3-btn m3-btn-primary"
                    >
                      {isGeneratingToken ? "生成中..." : "获取验证码"}
                    </button>
                  </div>
                )}

                {verifyState.verifyToken && (
                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-sm font-medium text-warm-800">你的验证码：</p>
                      <div className="m3-surface-soft flex items-center justify-between gap-3 px-4 py-3">
                        <code className="break-all font-mono text-sm text-warm-800">
                          {verifyState.verifyToken}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy("motd-token", verifyState.verifyToken!)}
                          className="m3-btn m3-btn-tonal shrink-0 px-3 py-1.5 text-xs"
                        >
                          {copiedField === "motd-token" ? "已复制" : "复制"}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-800">
                      <p>请将验证码添加到 server.properties 文件中的 motd= 行：</p>
                      <p className="mt-2 font-mono text-xs text-warm-500">
                        motd=你的原始MOTD {verifyState.verifyToken}
                      </p>
                      <p className="mt-3 text-xs text-warm-400">
                        注意：修改 MOTD 后必须重启服务器，变更才会生效。
                      </p>
                    </div>

                    {isMotdTokenExpired ? (
                      <p className="text-sm text-accent-hover">验证码已过期，请重新获取。</p>
                    ) : (
                      <p className="text-sm text-warm-500">
                        验证码有效期：还剩 {formatRemainingTime(motdRemainingMs)}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateToken}
                        disabled={isGeneratingToken}
                        className="m3-btn m3-btn-tonal"
                      >
                        {isGeneratingToken ? "生成中..." : "重新获取验证码"}
                      </button>
                      <button
                        type="button"
                        onClick={handleVerify}
                        disabled={isVerifying || isMotdTokenExpired || isGeneratingToken}
                        className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isVerifying ? "验证中..." : "开始验证"}
                      </button>
                    </div>

                    {isVerifying && (
                      <p className="text-sm text-warm-400">正在连接服务器，请稍候...</p>
                    )}
                  </div>
                )}

                {motdMessage && <div className="m3-alert-success">{motdMessage}</div>}

                {motdError && (
                  <div className="m3-alert-error space-y-2">
                    <p className="font-medium">验证未通过</p>
                    <p>原因：{motdError}</p>
                    <p className="text-xs text-accent-hover">
                      请确认：验证码已写入 MOTD、服务器已重启、服务器当前在线。
                    </p>
                    {verifyState.verifyToken && !isMotdTokenExpired && (
                      <button
                        type="button"
                        onClick={handleVerify}
                        className="m3-btn m3-btn-tonal px-3 py-1.5 text-xs"
                      >
                        重试验证
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
                    当前已有其他用户在认领该服务器。生成新密钥会覆盖之前的认领流程。
                  </div>
                )}

                <div className="m3-surface-soft p-4">
                  <p className="text-sm font-medium text-warm-800">认领步骤：</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-warm-500">
                    <li>点击下方按钮生成认领密钥</li>
                    <li>在你的 Minecraft 服务器中安装 Pudcraft 插件</li>
                    <li>将认领密钥和服务器 ID 填入插件配置文件</li>
                    <li>启动 / 重启 Minecraft 服务器，插件会自动完成认领</li>
                  </ol>
                  <p className="mt-3 text-xs text-warm-400">
                    认领需要从服务器本机发起请求，系统会校验请求来源 IP 是否与服务器地址一致。
                  </p>
                </div>

                {/* 服务器 ID */}
                <div>
                  <p className="mb-2 text-sm font-medium text-warm-800">服务器 ID：</p>
                  <div className="m3-surface-soft flex items-center justify-between gap-3 px-4 py-3">
                    <code className="font-mono text-sm text-warm-800">{id}</code>
                    <button
                      type="button"
                      onClick={() => handleCopy("server-id", id)}
                      className="m3-btn m3-btn-tonal shrink-0 px-3 py-1.5 text-xs"
                    >
                      {copiedField === "server-id" ? "已复制" : "复制"}
                    </button>
                  </div>
                </div>

                {/* 刚生成的密钥 */}
                {generatedKey && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-warm-800">认领密钥（仅显示一次）：</p>
                    <div className="m3-surface-soft flex items-center justify-between gap-3 px-4 py-3">
                      <code className="break-all font-mono text-sm text-warm-800">
                        {generatedKey}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy("claim-key", generatedKey)}
                        className="m3-btn m3-btn-tonal shrink-0 px-3 py-1.5 text-xs"
                      >
                        {copiedField === "claim-key" ? "已复制" : "复制"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-accent-hover">
                      请立即复制并保存。认领成功后此密钥将成为服务器的 API Key，后续无需再次获取。
                    </p>
                  </div>
                )}

                {/* 已有密钥但刷新了页面 */}
                {!generatedKey && claimKey.hasClaimKey && !isPluginKeyExpired && (
                  <div className="rounded-xl border border-accent bg-accent-muted px-4 py-3 text-sm text-accent">
                    <p className="font-medium">认领密钥已生成</p>
                    <p className="mt-1">等待插件从服务器发起认领请求...</p>
                  </div>
                )}

                {/* 倒计时 */}
                {claimKey.hasClaimKey && !isPluginKeyExpired && (
                  <p className="text-sm text-warm-500">
                    密钥有效期：还剩 {formatRemainingTime(pluginRemainingMs)}
                  </p>
                )}

                {/* 过期 */}
                {claimKey.hasClaimKey && isPluginKeyExpired && (
                  <p className="text-sm text-accent-hover">认领密钥已过期，请重新生成。</p>
                )}

                {/* 生成按钮 */}
                <button
                  type="button"
                  onClick={handleGenerateKey}
                  disabled={isGeneratingKey}
                  className="m3-btn m3-btn-primary"
                >
                  {isGeneratingKey
                    ? "生成中..."
                    : claimKey.hasClaimKey
                      ? "重新生成密钥"
                      : "生成认领密钥"}
                </button>

                {/* 配置示例 */}
                {(generatedKey || (claimKey.hasClaimKey && !isPluginKeyExpired)) && (
                  <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3 text-sm text-warm-800">
                    <p className="font-medium">插件配置示例：</p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre rounded-lg bg-warm-100 p-3 font-mono text-xs text-warm-500">
{`# config.yml
server-id: "${id}"
api-key: "${generatedKey ?? "pdc_你的认领密钥"}"
api-url: "${typeof window !== "undefined" ? window.location.origin : ""}"
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
