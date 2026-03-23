"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { PageLoading } from "@/components/PageLoading";
import { PostCard } from "@/components/forum/PostCard";
import { ServerCard } from "@/components/ServerCard";

import type { PostItem, ServerListItem } from "@/lib/types";

type Tab = "servers" | "posts";

export default function FavoritesPage() {
  const router = useRouter();
  const { status } = useSession();

  const [tab, setTab] = useState<Tab>("servers");

  // Server favorites
  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [serversLoading, setServersLoading] = useState(true);

  // Post bookmarks
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=%2Ffavorites");
    }
  }, [router, status]);

  // Fetch both on mount
  useEffect(() => {
    if (status !== "authenticated") {
      if (status !== "loading") {
        setServersLoading(false);
        setPostsLoading(false);
      }
      return;
    }

    let cancelled = false;

    async function fetchServers() {
      try {
        const res = await fetch("/api/user/favorites");
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { data: ServerListItem[] };
        if (!cancelled) setServers(json.data ?? []);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setServersLoading(false);
      }
    }

    async function fetchPosts() {
      try {
        const res = await fetch("/api/user/bookmarks");
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { posts: PostItem[] };
        if (!cancelled) setPosts(json.posts ?? []);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setPostsLoading(false);
      }
    }

    void fetchServers();
    void fetchPosts();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleBookmarkChange = useCallback(
    (postId: string, bookmarked: boolean) => {
      if (!bookmarked) {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      }
    },
    [],
  );

  if (status === "loading") {
    return <PageLoading text="正在加载登录状态..." />;
  }

  if (status === "unauthenticated") {
    return (
      <div className="py-12 text-center text-sm text-warm-500">
        正在跳转到登录页...
      </div>
    );
  }

  const isLoading = tab === "servers" ? serversLoading : postsLoading;

  return (
    <div>
      <section className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-warm-800">
          我的收藏
        </h1>
        <p className="mt-1.5 text-sm text-warm-500">
          收藏的服务器和帖子都在这里
        </p>
      </section>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-warm-100 p-1">
        <button
          type="button"
          onClick={() => setTab("servers")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "servers"
              ? "bg-surface text-warm-800 shadow-sm"
              : "text-warm-400 hover:text-warm-500"
          }`}
        >
          服务器
          {!serversLoading && servers.length > 0 && (
            <span className="ml-1.5 text-xs text-warm-400">
              {servers.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("posts")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "posts"
              ? "bg-surface text-warm-800 shadow-sm"
              : "text-warm-400 hover:text-warm-500"
          }`}
        >
          帖子
          {!postsLoading && posts.length > 0 && (
            <span className="ml-1.5 text-xs text-warm-400">
              {posts.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <PageLoading />
      ) : tab === "servers" ? (
        servers.length === 0 ? (
          <EmptyState
            title="暂无收藏的服务器"
            description="浏览服务器列表，点击星标收藏"
            action={{ label: "去发现服务器", href: "/servers" }}
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
                    setServers((prev) =>
                      prev.filter((s) => s.id !== server.id),
                    );
                  }
                }}
              />
            ))}
          </div>
        )
      ) : posts.length === 0 ? (
        <EmptyState
          title="暂无收藏的帖子"
          description="浏览帖子时点击收藏按钮"
          action={{ label: "去广场看看", href: "/" }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onBookmarkChange={handleBookmarkChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
