"use client";

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
  const [duplicateServer, setDuplicateServer] = useState<{
    id: string;
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
        return { success: false, error: "请先登录后再提交服务器" };
      }

      if (response.status === 409) {
        if (payload.existingServerId) {
          setDuplicateServer({
            id: payload.existingServerId,
            name: payload.existingServerName ?? "该服务器",
            hint: payload.hint ?? "如果你是这个服务器的管理员，可以去认领它",
          });
        }

        return {
          success: false,
          error: payload.error ?? "该服务器地址已被收录",
        };
      }

      if (!response.ok) {
        return {
          success: false,
          error: payload.error ?? "提交失败，请稍后重试",
        };
      }

      toast.success(payload.message ?? "服务器已提交，等待管理员审核");
      router.push("/console");
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
        <p className="mt-2 text-sm text-slate-600">
          提交你自己的 Minecraft 服务器信息，提交后将由管理员审核
        </p>
        {duplicateServer && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p>
              该服务器地址已被收录为「{duplicateServer.name}」。
              {duplicateServer.hint}
            </p>
            <Link
              href={`/servers/${duplicateServer.id}/verify`}
              className="m3-link mt-2 inline-flex text-sm"
            >
              前往认领
            </Link>
          </div>
        )}
        <ServerForm mode="create" cancelHref="/console" onSubmit={handleCreateServer} />
      </div>
    </div>
  );
}
