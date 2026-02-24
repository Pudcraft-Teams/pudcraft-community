"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { EmptyState } from "@/components/EmptyState";
import { PageLoading } from "@/components/PageLoading";
import { Pagination } from "@/components/Pagination";
import { SearchBar } from "@/components/SearchBar";
import { ServerCard } from "@/components/ServerCard";
import { SortButtons, type ServerSort } from "@/components/SortButtons";
import { useToast } from "@/hooks/useToast";
import type { ServerListItem } from "@/lib/types";

const TAG_FILTERS = ["全部", "生存", "创造", "RPG", "PVP", "科技", "模组", "空岛"];
const DEFAULT_SORT: ServerSort = "newest";
const DEFAULT_LIMIT = 12;
const SORT_SET = new Set<ServerSort>(["newest", "popular", "players", "name"]);

interface ServersResponse {
  data?: ServerListItem[];
  servers?: ServerListItem[];
  total?: number;
  page?: number;
  totalPages?: number;
  pagination?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
}

/**
 * 主页 —— 服务器信息流。
 * 支持标签筛选、关键词搜索、排序与分页。
 */
function HomePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const { toast } = useToast();

  const [servers, setServers] = useState<ServerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [favoriteServerIds, setFavoriteServerIds] = useState<string[]>([]);

  const rawTag = searchParams.get("tag") ?? "";
  const activeTag = rawTag || "全部";
  const search = searchParams.get("search") ?? "";

  const sort = useMemo<ServerSort>(() => {
    const value = searchParams.get("sort");
    if (value && SORT_SET.has(value as ServerSort)) {
      return value as ServerSort;
    }
    return DEFAULT_SORT;
  }, [searchParams]);

  const page = useMemo(() => {
    const rawPage = Number(searchParams.get("page") ?? "1");
    if (!Number.isFinite(rawPage) || rawPage < 1) {
      return 1;
    }
    return Math.floor(rawPage);
  }, [searchParams]);

  const updateParams = useCallback(
    (
      updates: Partial<Record<"tag" | "search" | "sort" | "page", string>>,
      options?: { resetPage?: boolean },
    ) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (!value) {
          params.delete(key);
          continue;
        }

        if (key === "sort" && value === DEFAULT_SORT) {
          params.delete(key);
          continue;
        }

        params.set(key, value);
      }

      if (options?.resetPage) {
        params.delete("page");
      } else if (params.get("page") === "1") {
        params.delete("page");
      }

      const nextQuery = params.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery === currentQuery) {
        return;
      }

      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.push(nextUrl);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchServers() {
      setLoading(true);

      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(DEFAULT_LIMIT));
        params.set("sort", sort);

        if (rawTag) {
          params.set("tag", rawTag);
        }
        if (search) {
          params.set("search", search);
        }

        const response = await fetch(`/api/servers?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Failed to fetch servers");
        }

        const payload = (await response.json()) as ServersResponse;
        if (cancelled) {
          return;
        }

        const list = Array.isArray(payload.data)
          ? payload.data
          : (Array.isArray(payload.servers) ? payload.servers : []);

        const nextTotalPages =
          typeof payload.totalPages === "number"
            ? payload.totalPages
            : (payload.pagination?.totalPages ?? 1);

        setServers(list);
        setTotalPages(Math.max(1, nextTotalPages));
      } catch {
        if (!cancelled) {
          setServers([]);
          setTotalPages(1);
          toast.error("服务器列表加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchServers();

    return () => {
      cancelled = true;
    };
  }, [page, rawTag, search, sort, toast]);

  useEffect(() => {
    if (status !== "authenticated") {
      setFavoriteServerIds([]);
      return;
    }

    let cancelled = false;

    async function fetchFavoriteIds() {
      try {
        const response = await fetch("/api/user/favorites/ids");
        const payload = (await response.json().catch(() => ({}))) as {
          serverIds?: unknown;
        };

        if (!response.ok) {
          if (!cancelled) {
            setFavoriteServerIds([]);
          }
          return;
        }

        if (!cancelled) {
          const ids = Array.isArray(payload.serverIds)
            ? payload.serverIds.filter((id): id is string => typeof id === "string")
            : [];
          setFavoriteServerIds(ids);
        }
      } catch {
        if (!cancelled) {
          setFavoriteServerIds([]);
        }
      }
    }

    fetchFavoriteIds();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleSearch = useCallback((query: string) => {
    updateParams({ search: query }, { resetPage: true });
  }, [updateParams]);

  return (
    <div>
      <section className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">发现服务器</h1>
        <p className="mt-2 text-sm text-slate-600">
          浏览国内优质 Minecraft 私人服务器，找到适合你的社区
        </p>
      </section>

      <div className="mb-4">
        <SearchBar onSearch={handleSearch} initialValue={search} />
      </div>

      <div className="scrollbar-hide mb-6 flex gap-2 overflow-x-auto whitespace-nowrap pb-2">
        {TAG_FILTERS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => {
              updateParams({ tag: tag === "全部" ? "" : tag }, { resetPage: true });
            }}
            className={`m3-chip ${tag === activeTag ? "m3-chip-active" : ""}`}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className="mb-6">
        <SortButtons
          value={sort}
          onChange={(nextSort) => {
            updateParams({ sort: nextSort }, { resetPage: true });
          }}
        />
      </div>

      {loading ? (
        <PageLoading />
      ) : servers.length === 0 ? (
        <EmptyState title="暂无服务器" description="试试其他筛选条件或搜索关键词" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              initialFavorited={favoriteServerIds.includes(server.id)}
              onFavoriteChange={(serverId, favorited) => {
                setFavoriteServerIds((prev) => {
                  if (favorited) {
                    return prev.includes(serverId) ? prev : [...prev, serverId];
                  }
                  return prev.filter((id) => id !== serverId);
                });
              }}
            />
          ))}
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={(nextPage) => {
          updateParams({ page: String(nextPage) });
        }}
      />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HomePageContent />
    </Suspense>
  );
}
