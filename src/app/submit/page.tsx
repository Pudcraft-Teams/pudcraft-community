"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { PageLoading } from "@/components/PageLoading";
import { ServerForm } from "@/components/ServerForm";
import { useToast } from "@/hooks/useToast";
import type { ServerFormSubmitResult } from "@/components/ServerForm";

interface ApiResponsePayload {
  error?: string;
  message?: string;
  hint?: string;
  existingServerId?: string;
  existingServerPsid?: number;
  existingServerName?: string;
}

function toApiPayload(raw: unknown): ApiResponsePayload {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    error: typeof payload.error === "string" ? payload.error : undefined,
    message: typeof payload.message === "string" ? payload.message : undefined,
    hint: typeof payload.hint === "string" ? payload.hint : undefined,
    existingServerId:
      typeof payload.existingServerId === "string" ? payload.existingServerId : undefined,
    existingServerPsid:
      typeof payload.existingServerPsid === "number" ? payload.existingServerPsid : undefined,
    existingServerName:
      typeof payload.existingServerName === "string" ? payload.existingServerName : undefined,
  };
}

/**
 * 提交服务器页面。
 * 登录用户可通过公共表单创建服务器记录。
 */
export default function SubmitServerPage() {
  const router = useRouter();
  const { status } = useSession();
  const { toast } = useToast();
  const t = useTranslations("servers.submit");
  const tCommon = useTranslations("servers.common");
  const [duplicateServer, setDuplicateServer] = useState<{
    id: string;
    psid: number | null;
    name: string;
    hint: string;
  } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=%2Fsubmit");
    }
  }, [router, status]);

  const handleCreateServer = async (formData: FormData): Promise<ServerFormSubmitResult> => {
    try {
      setDuplicateServer(null);

      const response = await fetch("/api/servers", {
        method: "POST",
        body: formData,
      });
      const payload = toApiPayload(await response.json().catch(() => ({})));

      if (response.status === 401) {
        router.replace("/login?callbackUrl=%2Fsubmit");
        return { success: false, error: t("loginRequired") };
      }

      if (response.status === 409) {
        if (payload.existingServerId) {
          setDuplicateServer({
            id: payload.existingServerId,
            psid: payload.existingServerPsid ?? null,
            name: payload.existingServerName ?? t("duplicateDefaultName"),
            hint: payload.hint ?? t("duplicateHintFallback"),
          });
        }

        return {
          success: false,
          error: payload.error ?? t("duplicateHintFallback"),
        };
      }

      if (!response.ok) {
        return {
          success: false,
          error: payload.error ?? t("submitFailed"),
        };
      }

      toast.success(payload.message ?? t("submittedSuccess"));
      router.push("/console");
      return { success: true };
    } catch {
      return { success: false, error: tCommon("networkError") };
    }
  };

  if (status === "loading") {
    return <PageLoading text={tCommon("loadingLoginStatus")} />;
  }

  if (status === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-warm-500">{tCommon("redirectingToLogin")}</div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-warm-800">{t("heading")}</h1>
        <p className="mt-2 text-sm text-warm-600">{t("description")}</p>
        {duplicateServer && (
          <div className="mt-4 rounded-xl border border-coral-amber/30 bg-coral-amber/10 px-4 py-3 text-sm text-coral-amber">
            <p>
              {t("duplicateMessage", {
                name: duplicateServer.name,
                hint: duplicateServer.hint,
              })}
            </p>
          </div>
        )}
        <ServerForm mode="create" cancelHref="/console" onSubmit={handleCreateServer} />
      </div>
    </div>
  );
}
