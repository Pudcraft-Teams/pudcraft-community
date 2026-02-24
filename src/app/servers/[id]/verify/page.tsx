"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageLoading } from "@/components/PageLoading";

interface VerifyStatusPayload {
  isVerified?: boolean;
  verifyToken?: string | null;
  verifyExpiresAt?: string | null;
  verifiedAt?: string | null;
  serverName?: string;
  error?: string;
}

interface VerifyStartPayload {
  token?: string;
  expiresAt?: string;
  instruction?: string;
  isVerified?: boolean;
  verifiedAt?: string | null;
  message?: string;
  error?: string;
}

interface VerifyRunPayload {
  success?: boolean;
  verified?: boolean;
  reason?: string;
  message?: string;
  error?: string;
}

interface VerifyState {
  isVerified: boolean;
  verifyToken: string | null;
  verifyExpiresAt: string | null;
  verifiedAt: string | null;
}

function parseVerifyStatusPayload(raw: unknown): VerifyStatusPayload {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    isVerified: typeof payload.isVerified === "boolean" ? payload.isVerified : undefined,
    verifyToken: typeof payload.verifyToken === "string" ? payload.verifyToken : null,
    verifyExpiresAt: typeof payload.verifyExpiresAt === "string" ? payload.verifyExpiresAt : null,
    verifiedAt: typeof payload.verifiedAt === "string" ? payload.verifiedAt : null,
    serverName: typeof payload.serverName === "string" ? payload.serverName : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

function parseVerifyStartPayload(raw: unknown): VerifyStartPayload {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    token: typeof payload.token === "string" ? payload.token : undefined,
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : undefined,
    instruction: typeof payload.instruction === "string" ? payload.instruction : undefined,
    isVerified: typeof payload.isVerified === "boolean" ? payload.isVerified : undefined,
    verifiedAt: typeof payload.verifiedAt === "string" ? payload.verifiedAt : null,
    message: typeof payload.message === "string" ? payload.message : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

function parseVerifyRunPayload(raw: unknown): VerifyRunPayload {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    success: typeof payload.success === "boolean" ? payload.success : undefined,
    verified: typeof payload.verified === "boolean" ? payload.verified : undefined,
    reason: typeof payload.reason === "string" ? payload.reason : undefined,
    message: typeof payload.message === "string" ? payload.message : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
}

function formatVerifiedAt(dateString: string | null): string | null {
  if (!dateString) {
    return null;
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * 服务器认领引导页。
 * Owner 可在此获取验证码并触发 MOTD 验证。
 */
export default function ServerVerifyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { status } = useSession();

  const [isLoading, setIsLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [serverName, setServerName] = useState("该服务器");
  const [verifyState, setVerifyState] = useState<VerifyState>({
    isVerified: false,
    verifyToken: null,
    verifyExpiresAt: null,
    verifiedAt: null,
  });

  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [verifyFailureReason, setVerifyFailureReason] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  const fetchVerifyStatus = useCallback(async (): Promise<boolean> => {
    const response = await fetch(`/api/servers/${id}/verify`, { cache: "no-store" });
    const payload = parseVerifyStatusPayload(await response.json().catch(() => ({})));

    if (response.status === 401) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/verify`)}`);
      return false;
    }

    if (response.status === 403) {
      setIsForbidden(true);
      setPageError(null);
      return false;
    }

    if (response.status === 404) {
      setPageError("服务器不存在或已被删除");
      return false;
    }

    if (!response.ok) {
      setPageError(payload.error ?? "加载认领状态失败，请稍后重试");
      return false;
    }

    if (payload.serverName) {
      setServerName(payload.serverName);
    }

    setVerifyState({
      isVerified: payload.isVerified === true,
      verifyToken: payload.verifyToken ?? null,
      verifyExpiresAt: payload.verifyExpiresAt ?? null,
      verifiedAt: payload.verifiedAt ?? null,
    });
    return true;
  }, [id, router]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/verify`)}`);
    }
  }, [id, router, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      if (status !== "loading") {
        setIsLoading(false);
      }
      return;
    }

    let cancelled = false;

    async function loadInitialState() {
      setIsLoading(true);
      setPageError(null);
      setIsForbidden(false);

      try {
        const ok = await fetchVerifyStatus();
        if (!ok && !cancelled) {
          setIsLoading(false);
          return;
        }
      } catch {
        if (!cancelled) {
          setPageError("加载认领状态失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialState();
    return () => {
      cancelled = true;
    };
  }, [fetchVerifyStatus, status]);

  useEffect(() => {
    if (!verifyState.verifyExpiresAt || verifyState.isVerified) {
      return;
    }

    const timer = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [verifyState.isVerified, verifyState.verifyExpiresAt]);

  const expiresAtTs = useMemo(() => {
    if (!verifyState.verifyExpiresAt) {
      return null;
    }

    const ts = new Date(verifyState.verifyExpiresAt).getTime();
    return Number.isNaN(ts) ? null : ts;
  }, [verifyState.verifyExpiresAt]);

  const remainingMs = useMemo(() => {
    if (!expiresAtTs) {
      return 0;
    }
    return expiresAtTs - tick;
  }, [expiresAtTs, tick]);

  const isTokenExpired = !!expiresAtTs && remainingMs <= 0;
  const verifiedAtLabel = formatVerifiedAt(verifyState.verifiedAt);

  const handleGenerateToken = async () => {
    setIsGeneratingToken(true);
    setStatusMessage(null);
    setVerifyFailureReason(null);

    try {
      const response = await fetch(`/api/servers/${id}/verify`, { method: "POST" });
      const payload = parseVerifyStartPayload(await response.json().catch(() => ({})));

      if (response.status === 401) {
        router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/verify`)}`);
        return;
      }

      if (response.status === 403) {
        setIsForbidden(true);
        return;
      }

      if (!response.ok) {
        setVerifyFailureReason(payload.error ?? payload.message ?? "获取验证码失败，请稍后重试");
        return;
      }

      if (payload.isVerified) {
        setVerifyState((prev) => ({
          ...prev,
          isVerified: true,
          verifiedAt: payload.verifiedAt ?? prev.verifiedAt,
          verifyToken: null,
          verifyExpiresAt: null,
        }));
        setStatusMessage(payload.message ?? "服务器已认领，无需重复验证");
        return;
      }

      const statusOk = await fetchVerifyStatus();
      if (statusOk) {
        setStatusMessage(payload.instruction ?? "验证码已生成，请将其写入 MOTD 后开始验证");
      }
    } catch {
      setVerifyFailureReason("网络异常，获取验证码失败");
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const handleVerify = async () => {
    if (!verifyState.verifyToken) {
      setVerifyFailureReason("请先获取验证码");
      return;
    }

    if (isTokenExpired) {
      setVerifyFailureReason("验证码已过期，请重新获取");
      return;
    }

    setIsVerifying(true);
    setStatusMessage(null);
    setVerifyFailureReason(null);

    try {
      const response = await fetch(`/api/servers/${id}/verify`, { method: "PATCH" });
      const payload = parseVerifyRunPayload(await response.json().catch(() => ({})));

      if (response.status === 401) {
        router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/verify`)}`);
        return;
      }

      if (response.status === 403) {
        setIsForbidden(true);
        return;
      }

      if (!response.ok) {
        setVerifyFailureReason(
          payload.reason ?? payload.error ?? payload.message ?? "验证未通过，请稍后重试",
        );
        return;
      }

      if (payload.success && payload.verified) {
        setStatusMessage(payload.message ?? "验证通过！你的服务器已获得认领标识。");
        await fetchVerifyStatus();
        return;
      }

      setVerifyFailureReason(payload.reason ?? payload.message ?? "验证未通过");
    } catch {
      setVerifyFailureReason("网络异常，验证失败，请稍后重试");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopyToken = async () => {
    if (!verifyState.verifyToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(verifyState.verifyToken);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      setVerifyFailureReason("复制失败，请手动复制验证码");
    }
  };

  if (status === "loading" || isLoading) {
    return <PageLoading />;
  }

  if (status === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-slate-500">正在跳转到登录页...</div>;
  }

  if (isForbidden) {
    return (
      <div className="m3-alert-error mx-auto max-w-2xl px-4 py-3">
        只有服务器 owner 才能访问认领页面。
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="m3-alert-error mx-auto max-w-2xl px-4 py-3">
        {pageError}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4">
      <nav className="flex items-center gap-2 text-sm text-slate-500">
        <Link href={`/servers/${id}`} className="m3-link">
          &larr; 返回服务器详情
        </Link>
      </nav>

      <section className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-slate-900">认领服务器「{serverName}」</h1>
        <p className="mt-2 text-sm text-slate-600">
          认领后你的服务器会获得「已认领」标识，提升可信度。
        </p>

        {verifyState.isVerified ? (
          <div className="mt-6 space-y-4">
            <div className="m3-alert-success">
              <p className="font-medium">✓ 此服务器已完成认领。</p>
              {verifiedAtLabel && <p className="mt-1 text-xs">验证时间：{verifiedAtLabel}</p>}
            </div>
            <Link href={`/servers/${id}`} className="m3-btn m3-btn-primary inline-flex">
              返回服务器详情
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {!verifyState.verifyToken && (
              <div className="space-y-4">
                <div className="m3-surface-soft p-4">
                  <p className="text-sm text-slate-700">认领步骤：</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                    <li>点击下方按钮获取验证码</li>
                    <li>将验证码添加到 `server.properties` 的 `motd=` 行</li>
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
                  <p className="mb-2 text-sm font-medium text-slate-700">你的验证码：</p>
                  <div className="m3-surface-soft flex items-center justify-between gap-3 px-4 py-3">
                    <code className="break-all font-mono text-sm text-slate-800">{verifyState.verifyToken}</code>
                    <button
                      type="button"
                      onClick={handleCopyToken}
                      className="m3-btn m3-btn-tonal shrink-0 px-3 py-1.5 text-xs"
                    >
                      {copied ? "已复制" : "复制"}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p>请将验证码添加到 `server.properties` 文件中的 `motd=` 行：</p>
                  <p className="mt-2 font-mono text-xs text-slate-600">
                    motd=你的原始MOTD {verifyState.verifyToken}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    注意：修改 MOTD 后必须重启服务器，变更才会生效。
                  </p>
                </div>

                {isTokenExpired ? (
                  <p className="text-sm text-rose-600">验证码已过期，请重新获取。</p>
                ) : (
                  <p className="text-sm text-slate-600">
                    验证码有效期：还剩 {formatRemainingTime(remainingMs)}
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
                    disabled={isVerifying || isTokenExpired || isGeneratingToken}
                    className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isVerifying ? "验证中..." : "开始验证"}
                  </button>
                </div>

                {isVerifying && (
                  <p className="text-sm text-slate-500">正在连接服务器，请稍候...</p>
                )}
              </div>
            )}

            {statusMessage && <div className="m3-alert-success">{statusMessage}</div>}

            {verifyFailureReason && (
              <div className="m3-alert-error space-y-2">
                <p className="font-medium">✗ 验证未通过</p>
                <p>原因：{verifyFailureReason}</p>
                <p className="text-xs text-rose-600">
                  请确认：验证码已写入 MOTD、服务器已重启、服务器当前在线。
                </p>
                {verifyState.verifyToken && !isTokenExpired && (
                  <button type="button" onClick={handleVerify} className="m3-btn m3-btn-tonal px-3 py-1.5 text-xs">
                    重试验证
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
