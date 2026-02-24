"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { PageLoading } from "@/components/PageLoading";
import { ServerForm } from "@/components/ServerForm";
import type { ServerFormSubmitResult } from "@/components/ServerForm";

interface ApiResponsePayload {
  error?: string;
}

function toApiPayload(raw: unknown): ApiResponsePayload {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

/**
 * 提交服务器页面。
 * 登录用户可通过公共表单创建服务器记录。
 */
export default function SubmitServerPage() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=%2Fsubmit");
    }
  }, [router, status]);

  const handleCreateServer = async (formData: FormData): Promise<ServerFormSubmitResult> => {
    try {
      const response = await fetch("/api/servers", {
        method: "POST",
        body: formData,
      });
      const payload = toApiPayload(await response.json().catch(() => ({})));

      if (response.status === 401) {
        router.replace("/login?callbackUrl=%2Fsubmit");
        return { success: false, error: "请先登录后再提交服务器" };
      }

      if (!response.ok) {
        return {
          success: false,
          error: payload.error ?? "提交失败，请稍后重试",
        };
      }

      router.push("/my-servers");
      return { success: true };
    } catch {
      return { success: false, error: "网络异常，请稍后重试" };
    }
  };

  if (status === "loading") {
    return <PageLoading text="正在加载登录状态..." />;
  }

  if (status === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-slate-500">正在跳转到登录页...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4">
      <div className="m3-surface p-6">
        <h1 className="text-2xl font-semibold text-slate-900">提交服务器</h1>
        <p className="mt-2 text-sm text-slate-600">提交你自己的 Minecraft 服务器信息</p>
        <ServerForm mode="create" cancelHref="/my-servers" onSubmit={handleCreateServer} />
      </div>
    </div>
  );
}
