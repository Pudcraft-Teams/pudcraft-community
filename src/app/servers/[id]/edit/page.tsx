"use client";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { PageLoading } from "@/components/PageLoading";
import { ServerForm } from "@/components/ServerForm";
import { useToast } from "@/hooks/useToast";
import type { ServerFormInitialData, ServerFormSubmitResult } from "@/components/ServerForm";
import { extractServerContentMetadata } from "@/lib/serverContent";
import type { ServerDetailResponse } from "@/lib/types";

interface ApiResponsePayload {
  error?: string;
  warning?: string;
  resubmittedForReview?: boolean;
}

function toApiPayload(raw: unknown): ApiResponsePayload {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    error: typeof payload.error === "string" ? payload.error : undefined,
    warning: typeof payload.warning === "string" ? payload.warning : undefined,
    resubmittedForReview:
      typeof payload.resubmittedForReview === "boolean"
        ? payload.resubmittedForReview
        : undefined,
  };
}

/**
 * 服务器编辑页面。
 * 仅 owner 可编辑，提交后返回详情页。
 */
export default function EditServerPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [initialData, setInitialData] = useState<ServerFormInitialData | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/edit`)}`);
    }
  }, [id, router, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      if (status !== "loading") {
        setIsLoading(false);
      }
      return;
    }

    if (!id) {
      setError("无效的服务器 ID");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setIsForbidden(false);

    async function fetchServer() {
      try {
        const response = await fetch(`/api/servers/${id}`);
        const payload = (await response.json().catch(() => ({}))) as Partial<ServerDetailResponse> &
          ApiResponsePayload;

        if (!response.ok) {
          if (!cancelled) {
            setError(payload.error ?? "加载服务器信息失败");
          }
          return;
        }

        const data = payload.data;
        if (!data) {
          if (!cancelled) {
            setError("服务器数据异常，请稍后重试");
          }
          return;
        }

        const currentUserId = session?.user?.id;
        if (!currentUserId || data.ownerId !== currentUserId) {
          if (!cancelled) {
            setIsForbidden(true);
            window.setTimeout(() => {
              router.replace(`/servers/${id}`);
            }, 1200);
          }
          return;
        }

        const metadata = extractServerContentMetadata(data.content);
        const resolvedMaxPlayers =
          metadata.maxPlayers ?? (typeof data.status.maxPlayers === "number" ? data.status.maxPlayers : null);

        if (!cancelled) {
          setInitialData({
            name: data.name,
            address: data.host,
            port: data.port,
            version: metadata.version ?? "",
            tags: data.tags,
            description: data.description ?? "",
            content: metadata.body,
            maxPlayers: resolvedMaxPlayers,
            qqGroup: metadata.qqGroup ?? "",
            iconUrl: data.iconUrl,
          });
        }
      } catch {
        if (!cancelled) {
          setError("加载服务器信息失败");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchServer();
    return () => {
      cancelled = true;
    };
  }, [id, router, session?.user?.id, status]);

  const handleUpdateServer = async (formData: FormData): Promise<ServerFormSubmitResult> => {
    try {
      const response = await fetch(`/api/servers/${id}`, {
        method: "PATCH",
        body: formData,
      });
      const payload = toApiPayload(await response.json().catch(() => ({})));

      if (response.status === 401) {
        router.replace(`/login?callbackUrl=${encodeURIComponent(`/servers/${id}/edit`)}`);
        return { success: false, error: "请先登录" };
      }

      if (response.status === 403) {
        setIsForbidden(true);
        window.setTimeout(() => {
          router.replace(`/servers/${id}`);
        }, 1200);
        return { success: false, error: "无权限编辑此服务器" };
      }

      if (!response.ok) {
        return {
          success: false,
          error: payload.error ?? "保存失败，请稍后重试",
        };
      }

      toast.success(payload.resubmittedForReview ? "已重新提交审核" : "保存成功");
      router.push(`/servers/${id}`);
      router.refresh();
      return {
        success: true,
        warning: payload.warning,
      };
    } catch {
      return { success: false, error: "网络异常，请稍后重试" };
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
        无权限编辑此服务器，正在返回详情页...
      </div>
    );
  }

  if (error || !initialData) {
    return (
      <div className="m3-alert-error mx-auto max-w-2xl px-4 py-3">
        {error ?? "服务器不存在或已被删除"}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-slate-900">编辑服务器</h1>
        <p className="mt-2 text-sm text-slate-600">更新服务器信息并保存修改</p>
        <ServerForm
          mode="edit"
          initialData={initialData}
          cancelHref={`/servers/${id}`}
          onSubmit={handleUpdateServer}
        />
      </div>
    </div>
  );
}
