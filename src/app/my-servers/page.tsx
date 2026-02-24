"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { DeleteServerDialog } from "@/components/DeleteServerDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageLoading } from "@/components/PageLoading";
import { ServerCard } from "@/components/ServerCard";
import { useToast } from "@/hooks/useToast";
import type { ServerListItem } from "@/lib/types";

interface MyServersResponse {
  data: ServerListItem[];
}

/**
 * 我的服务器页面。
 * 仅登录用户可访问，展示当前用户提交的服务器列表。
 */
export default function MyServersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=%2Fmy-servers");
    }
  }, [router, status]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (status !== "authenticated" || !userId) {
      if (status !== "loading") {
        setIsLoading(false);
      }
      return;
    }
    const ownerId = userId;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function fetchMyServers() {
      try {
        const params = new URLSearchParams();
        params.set("ownerId", ownerId);
        params.set("limit", "50");
        const response = await fetch(`/api/servers?${params.toString()}`);
        if (!response.ok) {
          throw new Error("获取服务器列表失败");
        }

        const payload = (await response.json()) as MyServersResponse;
        if (!cancelled) {
          setServers(payload.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("加载失败，请稍后重试");
          toast.error("加载我的服务器失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchMyServers();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, status, toast]);

  if (status === "loading") {
    return <PageLoading text="正在加载登录状态..." />;
  }

  if (status === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-slate-500">正在跳转到登录页...</div>;
  }

  return (
    <div>
      <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">我的服务器</h1>
          <p className="mt-2 text-sm text-slate-600">你提交并管理的服务器列表</p>
        </div>
        <Link
          href="/submit"
          className="m3-btn m3-btn-primary"
        >
          去提交
        </Link>
      </section>

      {isLoading ? (
        <PageLoading />
      ) : error ? (
        <div className="m3-alert-error px-4 py-3">
          {error}
        </div>
      ) : servers.length === 0 ? (
        <EmptyState
          title="暂无服务器"
          description="你还没有提交服务器"
          action={{ label: "去提交", href: "/submit" }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <div key={server.id} className="space-y-2">
              <ServerCard server={server} showFavoriteButton={false} />
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs font-medium ${
                    server.isVerified ? "text-teal-700" : "text-slate-500"
                  }`}
                >
                  {server.isVerified ? "✓ 已认领" : "未认领"}
                </span>
                {!server.isVerified && (
                  <Link
                    href={`/servers/${server.id}/verify`}
                    className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 text-xs text-teal-700"
                  >
                    认领
                  </Link>
                )}
                <Link
                  href={`/servers/${server.id}/edit`}
                  className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 text-xs"
                >
                  编辑
                </Link>
                <DeleteServerDialog
                  serverId={server.id}
                  serverName={server.name}
                  onDeleted={(deletedId) => {
                    setServers((prev) => prev.filter((item) => item.id !== deletedId));
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
