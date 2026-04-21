"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/EmptyState";
import { PageLoading } from "@/components/PageLoading";
import { Pagination } from "@/components/Pagination";
import { SearchBar } from "@/components/SearchBar";
import { ServerCard } from "@/components/ServerCard";
import { SortButtons } from "@/components/SortButtons";
import { useToast } from "@/hooks/useToast";
import { buildServerListPath, type ServerSort } from "@/lib/serverListQuery";
import type { ServerListItem } from "@/lib/types";

const TAG_FILTER_KEYS = [
  "tagAll",
  "tagSurvival",
  "tagCreative",
  "tagRpg",
  "tagPvp",
  "tagTech",
  "tagMod",
  "tagSkyblock",
] as const;

// Raw tag values used as API filter params. Keep aligned with TAG_FILTER_KEYS.
const TAG_FILTER_VALUES = ["全部", "生存", "创造", "RPG", "PVP", "科技", "模组", "空岛"];
const DEFAULT_LIMIT = 12;

interface HomePageClientProps {
  initialServers: ServerListItem[];
  initialPage: number;
  initialSort: ServerSort;
  initialTag: string;
  initialSearch: string;
  initialTotalPages: number;
  basePath: "/" | "/servers";
}

interface QueryState {
  page: number;
  sort: ServerSort;
  tag: string;
  search: string;
}

interface ServersResponse {
  data?: ServerListItem[];
  servers?: ServerListItem[];
  totalPages?: number;
  pagination?: {
    totalPages?: number;
  };
}

/**
 * 首页交互层（Client Component）。
 * 首屏数据由服务端注入，筛选/排序/分页在客户端请求更新。
 */
export function HomePageClient({
  initialServers,
  initialPage,
  initialSort,
  initialTag,
  initialSearch,
  initialTotalPages,
  basePath,
}: HomePageClientProps) {
  const router = useRouter();
  const { status } = useSession();
  const { toast } = useToast();
  const t = useTranslations("servers.list");
  const [servers, setServers] = useState<ServerListItem[]>(initialServers);
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(Math.max(1, initialTotalPages));
  const [favoriteServerIds, setFavoriteServerIds] = useState<string[]>([]);
  const [query, setQuery] = useState<QueryState>({
    page: initialPage,
    sort: initialSort,
    tag: initialTag,
    search: initialSearch,
  });

  const skipFirstFetchRef = useRef(true);

  const activeTag = query.tag || TAG_FILTER_VALUES[0];
  const buildUrl = useCallback((nextQuery: QueryState) => {
    return `${basePath}${buildServerListPath(nextQuery)}`;
  }, [basePath]);

  const updateQuery = useCallback(
    (
      updates: Partial<QueryState>,
      options?: {
        resetPage?: boolean;
      },
    ) => {
      setQuery((previous) => {
        const next: QueryState = {
          ...previous,
          ...updates,
        };

        if (options?.resetPage) {
          next.page = 1;
        }

        if (!Number.isFinite(next.page) || next.page < 1) {
          next.page = 1;
        }

        if (
          previous.page === next.page &&
          previous.sort === next.sort &&
          previous.tag === next.tag &&
          previous.search === next.search
        ) {
          return previous;
        }

        return next;
      });
    },
    [],
  );

  useEffect(() => {
    window.history.replaceState(null, "", buildUrl(query));
  }, [buildUrl, query]);

  useEffect(() => {
    if (skipFirstFetchRef.current) {
      skipFirstFetchRef.current = false;
      return;
    }

    let cancelled = false;

    async function fetchServers() {
      setLoading(true);

      try {
        const params = new URLSearchParams();
        params.set("page", String(query.page));
        params.set("limit", String(DEFAULT_LIMIT));
        params.set("sort", query.sort);

        if (query.tag) {
          params.set("tag", query.tag);
        }
        if (query.search) {
          params.set("search", query.search);
        }

        const response = await fetch(`/api/servers?${params.toString()}`);
        if (!response.ok) {
          throw new Error(t("loadFailed"));
        }

        const payload = (await response.json()) as ServersResponse;
        if (cancelled) {
          return;
        }

        const list = Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.servers)
            ? payload.servers
            : [];

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
          toast.error(t("loadFailedToast"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchServers();

    return () => {
      cancelled = true;
    };
  }, [query.page, query.search, query.sort, query.tag, t, toast]);

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

    void fetchFavoriteIds();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleSearch = useCallback(
    (nextSearch: string) => {
      const trimmed = nextSearch.trim();

      // 6 位纯数字 → PSID 跳转
      if (/^\d{6}$/.test(trimmed)) {
        router.push(`/servers/${trimmed}`);
        return;
      }

      // 9 位纯数字 → UID 跳转
      if (/^\d{9}$/.test(trimmed)) {
        router.push(`/u/${trimmed}`);
        return;
      }

      updateQuery({ search: nextSearch }, { resetPage: true });
    },
    [router, updateQuery],
  );

  const sort = useMemo(() => query.sort, [query.sort]);

  return (
    <div>
      {/* Hero — 精简：只保留文案和搜索 */}
      <section className="mb-8 pt-2">
        <h1 className="text-2xl font-bold tracking-tight text-warm-800">
          {t("heroTitle")}
        </h1>
        <p className="mt-1.5 text-sm text-warm-500">{t("heroSubtitle")}</p>

        <div className="mt-5 max-w-lg">
          <SearchBar onSearch={handleSearch} initialValue={query.search} />
        </div>

        <div className="scrollbar-hide mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {TAG_FILTER_KEYS.map((key, index) => {
            const value = TAG_FILTER_VALUES[index];
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  updateQuery(
                    { tag: value === TAG_FILTER_VALUES[0] ? "" : value },
                    { resetPage: true },
                  );
                }}
                className={`m3-chip ${value === activeTag ? "m3-chip-active" : ""}`}
              >
                {t(key)}
              </button>
            );
          })}
        </div>
      </section>

      {/* 排序 + 结果 */}
      <div className="mb-4 flex items-center justify-between">
        <SortButtons
          value={sort}
          onChange={(nextSort) => {
            updateQuery({ sort: nextSort }, { resetPage: true });
          }}
        />
      </div>

      {loading ? (
        <PageLoading />
      ) : servers.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((server, index) => (
            <ServerCard
              key={server.id}
              server={server}
              style={{ animationDelay: `${index * 50}ms` }}
              initialFavorited={favoriteServerIds.includes(server.id)}
              onFavoriteChange={(serverId, favorited) => {
                setFavoriteServerIds((previous) => {
                  if (favorited) {
                    return previous.includes(serverId) ? previous : [...previous, serverId];
                  }
                  return previous.filter((id) => id !== serverId);
                });
              }}
            />
          ))}
        </div>
      )}

      <Pagination
        currentPage={query.page}
        totalPages={totalPages}
        onPageChange={(nextPage) => {
          updateQuery({ page: nextPage });
        }}
      />
    </div>
  );
}
