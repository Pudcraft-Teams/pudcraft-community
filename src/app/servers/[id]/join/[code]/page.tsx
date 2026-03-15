"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageLoading } from "@/components/PageLoading";

interface ServerInfo {
  name: string;
  psid: number;
  iconUrl: string | null;
}

/**
 * 邀请加入页。
 * 用户通过邀请链接 /servers/:id/join/:code 进入此页面，
 * 填写 MC 用户名后通过邀请码加入服务器。
 */
export default function InviteJoinPage() {
  const router = useRouter();
  const { id, code } = useParams<{ id: string; code: string }>();
  const { status } = useSession();

  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [isLoadingServer, setIsLoadingServer] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [mcUsername, setMcUsername] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const redirectTimerRef = useRef<number | null>(null);

  // 清理重定向计时器
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  // 未登录时跳转登录页
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        `/login?callbackUrl=${encodeURIComponent(`/servers/${id}/join/${code}`)}`,
      );
    }
  }, [id, code, router, status]);

  // 加载服务器基本信息
  const fetchServerInfo = useCallback(async () => {
    setIsLoadingServer(true);
    setPageError(null);

    try {
      const response = await fetch(`/api/servers/${id}`, { cache: "no-store" });

      if (response.status === 404) {
        setPageError("服务器未找到");
        return;
      }

      if (!response.ok) {
        setPageError("加载服务器信息失败，请稍后重试");
        return;
      }

      const data: unknown = await response.json();
      if (typeof data === "object" && data !== null) {
        const body = data as Record<string, unknown>;
        const payload =
          typeof body.data === "object" && body.data !== null
            ? (body.data as Record<string, unknown>)
            : body;
        setServerInfo({
          name: typeof payload.name === "string" ? payload.name : "未知服务器",
          psid: typeof payload.psid === "number" ? payload.psid : 0,
          iconUrl: typeof payload.iconUrl === "string" ? payload.iconUrl : null,
        });
      }
    } catch {
      setPageError("网络异常，无法加载服务器信息");
    } finally {
      setIsLoadingServer(false);
    }
  }, [id]);

  useEffect(() => {
    if (status !== "authenticated") {
      if (status !== "loading") {
        setIsLoadingServer(false);
      }
      return;
    }

    let cancelled = false;

    async function load() {
      await fetchServerInfo();
      if (cancelled) return;
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchServerInfo, status]);

  // 客户端校验 MC 用户名
  function validateMcUsername(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return "请输入 MC 用户名";
    }
    if (trimmed.length < 3) {
      return "MC 用户名至少 3 个字符";
    }
    if (trimmed.length > 16) {
      return "MC 用户名最多 16 个字符";
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return "MC 用户名只能包含字母、数字和下划线";
    }
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || successMessage) return;

    // 清除旧状态
    setFieldError(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    // 客户端校验
    const validationError = validateMcUsername(mcUsername);
    if (validationError) {
      setFieldError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/servers/${id}/join/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcUsername: mcUsername.trim() }),
      });

      if (response.status === 401) {
        router.replace(
          `/login?callbackUrl=${encodeURIComponent(`/servers/${id}/join/${code}`)}`,
        );
        return;
      }

      const payload: unknown = await response.json().catch(() => ({}));
      const errorText =
        typeof payload === "object" && payload !== null
          ? (payload as Record<string, unknown>).error
          : undefined;

      if (response.status === 409) {
        setErrorMessage(
          typeof errorText === "string" ? errorText : "你已经是该服务器的成员",
        );
        return;
      }

      if (response.status === 404 || response.status === 410) {
        setErrorMessage(
          typeof errorText === "string" ? errorText : "邀请码无效或已过期",
        );
        return;
      }

      if (!response.ok) {
        setErrorMessage(
          typeof errorText === "string" ? errorText : "加入失败，请稍后重试",
        );
        return;
      }

      // 成功
      setSuccessMessage("加入成功！即将跳转到服务器详情页...");
      const psid = serverInfo?.psid;
      const target = psid ? `/servers/${psid}` : `/servers/${id}`;
      redirectTimerRef.current = window.setTimeout(() => {
        router.push(target);
      }, 2000);
    } catch {
      setErrorMessage("网络异常，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── 渲染 ────────────────────────────────────────

  if (status === "loading" || isLoadingServer) {
    return <PageLoading />;
  }

  if (status === "unauthenticated") {
    return (
      <div className="py-12 text-center text-sm text-warm-500">
        正在跳转到登录页...
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="mx-auto max-w-md px-4">
        <div className="m3-alert-error py-3">{pageError}</div>
        <Link href="/" className="m3-link mt-4 inline-block text-sm">
          &larr; 返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-warm-800">
          加入服务器
        </h1>
        {serverInfo && (
          <p className="mt-2 text-sm text-warm-600">
            你正在通过邀请码加入「{serverInfo.name}」
          </p>
        )}

        {/* 成功提示 */}
        {successMessage && (
          <div className="m3-alert-success mt-5">
            <p className="font-medium">{successMessage}</p>
          </div>
        )}

        {/* 错误提示 */}
        {errorMessage && (
          <div className="m3-alert-error mt-5">
            <p>{errorMessage}</p>
          </div>
        )}

        {/* 表单 */}
        {!successMessage && (
          <form className="mt-5 space-y-4" onSubmit={handleSubmit} noValidate>
            <fieldset disabled={isSubmitting} className="space-y-4 disabled:opacity-90">
              <label className="block text-sm text-warm-700">
                MC 用户名
                <input
                  type="text"
                  value={mcUsername}
                  onChange={(event) => {
                    setMcUsername(event.target.value);
                    setFieldError(null);
                  }}
                  className="m3-input mt-2 w-full"
                  placeholder="输入你的 Minecraft 用户名"
                  autoComplete="off"
                  maxLength={16}
                />
                {fieldError && (
                  <p className="mt-1 text-xs text-coral-hover">{fieldError}</p>
                )}
              </label>
            </fieldset>

            <button
              type="submit"
              disabled={isSubmitting}
              className="m3-btn m3-btn-primary w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "加入中..." : "加入服务器"}
            </button>
          </form>
        )}

        {/* 底部链接 */}
        <div className="mt-6 text-center">
          <Link
            href={serverInfo?.psid ? `/servers/${serverInfo.psid}` : `/servers/${id}`}
            className="m3-link text-sm"
          >
            查看服务器详情
          </Link>
        </div>
      </div>
    </div>
  );
}
