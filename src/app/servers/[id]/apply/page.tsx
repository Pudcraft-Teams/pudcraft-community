"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { ApplicationForm } from "@/components/ApplicationForm";
import { PageLoading } from "@/components/PageLoading";
import type { ApplicationFormField, MembershipStatus } from "@/lib/types";

interface ServerInfo {
  name: string;
  psid: number;
  iconUrl: string | null;
  joinMode: string;
  applicationForm: ApplicationFormField[] | null;
}

/**
 * 入服申请页。
 * 用户通过 /servers/:id/apply 进入此页面，
 * 根据服务器配置的 applicationForm 渲染动态表单并提交申请。
 */
export default function ApplyPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { status: authStatus } = useSession();

  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [membership, setMembership] = useState<MembershipStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace(
        `/login?callbackUrl=${encodeURIComponent(`/servers/${id}/apply`)}`,
      );
    }
  }, [id, router, authStatus]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setPageError(null);

    try {
      const [serverRes, membershipRes] = await Promise.all([
        fetch(`/api/servers/${id}`, { cache: "no-store" }),
        fetch(`/api/servers/${id}/membership`, { cache: "no-store" }),
      ]);

      if (serverRes.status === 404) {
        setPageError("服务器未找到");
        return;
      }

      if (!serverRes.ok) {
        setPageError("加载服务器信息失败，请稍后重试");
        return;
      }

      const serverBody = (await serverRes.json()) as { data?: Record<string, unknown> };
      const s = serverBody.data;
      if (!s) {
        setPageError("加载服务器信息失败");
        return;
      }

      const joinMode = typeof s.joinMode === "string" ? s.joinMode : "open";

      if (joinMode !== "apply" && joinMode !== "apply_and_invite") {
        setPageError("该服务器不接受入服申请");
        return;
      }

      setServerInfo({
        name: typeof s.name === "string" ? s.name : "未知服务器",
        psid: typeof s.psid === "number" ? s.psid : 0,
        iconUrl: typeof s.iconUrl === "string" ? s.iconUrl : null,
        joinMode,
        applicationForm: Array.isArray(s.applicationForm)
          ? (s.applicationForm as ApplicationFormField[])
          : null,
      });

      if (membershipRes.ok) {
        const membershipBody = (await membershipRes.json()) as MembershipStatus;
        setMembership(membershipBody);
      }
    } catch {
      setPageError("网络异常，无法加载页面");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authStatus !== "authenticated") {
      if (authStatus !== "loading") {
        setIsLoading(false);
      }
      return;
    }

    let cancelled = false;

    async function load() {
      await fetchData();
      if (cancelled) return;
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchData, authStatus]);

  const serverDetailUrl = serverInfo?.psid
    ? `/servers/${serverInfo.psid}`
    : `/servers/${id}`;

  // ─── Render ─────────────────────────────────────

  if (authStatus === "loading" || isLoading) {
    return <PageLoading />;
  }

  if (authStatus === "unauthenticated") {
    return (
      <div className="py-12 text-center text-sm text-warm-500">
        正在跳转到登录页...
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="mx-auto max-w-md px-4">
        <div className="m3-surface p-6 text-center">
          <p className="text-sm text-warm-600">{pageError}</p>
          <Link href="/" className="m3-link mt-4 inline-block text-sm">
            &larr; 返回首页
          </Link>
        </div>
      </div>
    );
  }

  if (!serverInfo) {
    return null;
  }

  // Already a member
  if (membership?.isMember) {
    return (
      <div className="mx-auto max-w-md px-4">
        <div className="m3-surface p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-forest-light">
            <svg
              className="h-6 w-6 text-forest"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-warm-800">你已是该服务器成员</h2>
          <p className="mt-1 text-sm text-warm-500">无需再次申请</p>
          <Link href={serverDetailUrl} className="m3-link mt-4 inline-block text-sm">
            返回服务器详情
          </Link>
        </div>
      </div>
    );
  }

  // Has pending application
  if (membership?.application?.status === "pending") {
    return (
      <div className="mx-auto max-w-md px-4">
        <div className="m3-surface p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-coral-amber">
            <svg
              className="h-6 w-6 text-coral-amber"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-warm-800">申请审核中</h2>
          <p className="mt-1 text-sm text-warm-500">你已提交过申请，请等待服主审核</p>
          <Link href={serverDetailUrl} className="m3-link mt-4 inline-block text-sm">
            返回服务器详情
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4">
      <nav className="mb-4 text-sm text-warm-500">
        <Link href={serverDetailUrl} className="m3-link">
          &larr; {serverInfo.name}
        </Link>
      </nav>

      <ApplicationForm
        serverId={id}
        fields={serverInfo.applicationForm}
        onSuccess={() => {
          // Redirect back to server detail after brief delay
          setTimeout(() => {
            router.push(serverDetailUrl);
          }, 2000);
        }}
      />
    </div>
  );
}
