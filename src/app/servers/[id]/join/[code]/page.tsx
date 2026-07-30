"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("servers.join");
  const tCommon = useTranslations("servers.common");

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
  }, [code, id, router, status]);

  // 加载服务器基本信息
  const fetchServerInfo = useCallback(async () => {
    setIsLoadingServer(true);
    setPageError(null);

    try {
      const response = await fetch(`/api/servers/${id}`, { cache: "no-store" });

      if (response.status === 404) {
        setPageError(t("serverNotFound"));
        return;
      }

      if (!response.ok) {
        setPageError(t("loadFailedRetry"));
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
          name: typeof payload.name === "string" ? payload.name : t("unknownServer"),
          psid: typeof payload.psid === "number" ? payload.psid : 0,
          iconUrl: typeof payload.iconUrl === "string" ? payload.iconUrl : null,
        });
      }
    } catch {
      setPageError(t("networkError"));
    } finally {
      setIsLoadingServer(false);
    }
  }, [id, t]);

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
      return t("mcUsernameRequired");
    }
    if (trimmed.length < 3) {
      return t("mcUsernameMin");
    }
    if (trimmed.length > 16) {
      return t("mcUsernameMax");
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return t("mcUsernameFormat");
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
          typeof errorText === "string" ? errorText : t("alreadyMember"),
        );
        return;
      }

      if (response.status === 404 || response.status === 410) {
        setErrorMessage(
          typeof errorText === "string" ? errorText : t("inviteInvalidExpired"),
        );
        return;
      }

      if (!response.ok) {
        setErrorMessage(
          typeof errorText === "string" ? errorText : t("submitFailed"),
        );
        return;
      }

      // 成功
      setSuccessMessage(t("successMessage"));
      const psid = serverInfo?.psid;
      const target = psid ? `/servers/${psid}` : `/servers/${id}`;
      redirectTimerRef.current = window.setTimeout(() => {
        router.push(target);
      }, 2000);
    } catch {
      setErrorMessage(t("networkSubmitError"));
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
        {tCommon("redirectingToLogin")}
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="mx-auto max-w-md px-4">
        <div className="m3-alert-error py-3">{pageError}</div>
        <Link href="/" className="m3-link mt-4 inline-block text-sm">
          &larr; {t("backHome")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-warm-800">
          {t("heading")}
        </h1>
        {serverInfo && (
          <p className="mt-2 text-sm text-warm-600">
            {t("subtitle", { name: serverInfo.name })}
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
                {t("mcUsernameLabel")}
                <input
                  type="text"
                  value={mcUsername}
                  onChange={(event) => {
                    setMcUsername(event.target.value);
                    setFieldError(null);
                  }}
                  className="m3-input mt-2 w-full"
                  placeholder={t("mcUsernamePlaceholder")}
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
              {isSubmitting ? t("submitting") : t("submit")}
            </button>
          </form>
        )}

        {/* 底部链接 */}
        <div className="mt-6 text-center">
          <Link
            href={serverInfo?.psid ? `/servers/${serverInfo.psid}` : `/servers/${id}`}
            className="m3-link text-sm"
          >
            {t("viewDetail")}
          </Link>
        </div>
      </div>
    </div>
  );
}
