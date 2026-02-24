"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { PageLoading } from "@/components/PageLoading";
import { ServerCard } from "@/components/ServerCard";
import { useToast } from "@/hooks/useToast";
import type { ServerListItem } from "@/lib/types";

interface FavoritesResponse {
  data: ServerListItem[];
}

/**
 * 我的收藏页面。
 * 登录用户可查看和管理已收藏的服务器。
 */
export default function FavoritesPage() {
  const router = useRouter();
  const { status } = useSession();
  const { toast } = useToast();
  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=%2Ffavorites");
    }
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      if (status !== "loading") {
        setIsLoading(false);
      }
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function fetchFavorites() {
      try {
        const response = await fetch("/api/user/favorites");
        if (!response.ok) {
          throw new Error("加载收藏失败");
        }

        const payload = (await response.json()) as FavoritesResponse;
        if (!cancelled) {
          setServers(payload.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setError("加载收藏失败，请稍后重试");
          toast.error("加载收藏失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchFavorites();
    return () => {
      cancelled = true;
    };
  }, [status, toast]);

  if (status === "loading") {
    return <PageLoading text="正在加载登录状态..." />;
  }

  if (status === "unauthenticated") {
    return <div className="py-12 text-center text-sm text-slate-500">正在跳转到登录页...</div>;
  }

  return (
    <div>
      <section className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">我的收藏</h1>
        <p className="mt-2 text-sm text-slate-600">你标记的服务器会展示在这里</p>
      </section>

      {isLoading ? (
        <PageLoading />
      ) : error ? (
        <div className="m3-alert-error">{error}</div>
      ) : servers.length === 0 ? (
        <EmptyState
          title="暂无收藏"
          description="你还没有收藏服务器"
          action={{ label: "去发现服务器", href: "/" }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              initialFavorited
              onFavoriteChange={(_, favorited) => {
                if (!favorited) {
                  setServers((prev) => prev.filter((item) => item.id !== server.id));
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
