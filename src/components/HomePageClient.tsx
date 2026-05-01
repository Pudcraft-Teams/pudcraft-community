"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState } from "@/components/EmptyState";
import { PageLoading } from "@/components/PageLoading";
import { Pagination } from "@/components/Pagination";
import { SearchBar } from "@/components/SearchBar";
import { ServerCard } from "@/components/ServerCard";
import { SortButtons } from "@/components/SortButtons";
import { useToast } from "@/hooks/useToast";
import { pickCoverClass } from "@/lib/server-cover";
import { normalizeServerListResponse } from "@/lib/serverListResponse";
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
const TAG_FILTER_SWATCHES: Record<string, string> = {
  生存: "var(--mode-survival)",
  创造: "var(--mode-creative)",
  RPG: "var(--mode-rpg)",
  PVP: "var(--mode-pvp)",
  科技: "var(--mode-tech)",
  模组: "var(--mode-mod)",
  空岛: "var(--mode-sky)",
  原版: "var(--mode-vanilla)",
  小游戏: "var(--mode-mini)",
};
const DEFAULT_LIMIT = 12;

interface HomePageClientProps {
  initialServers: ServerListItem[];
  initialPage: number;
  initialSort: ServerSort;
  initialTag: string;
  initialSearch: string;
  initialTotalPages: number;
  basePath: "/" | "/servers";
  variant?: "home" | "list";
  totalServers?: number;
  onlineServers?: number;
  activePlayers?: number;
}

interface QueryState {
  page: number;
  sort: ServerSort;
  tag: string;
  search: string;
}

function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}

export function HomePageClient({
  initialServers,
  initialPage,
  initialSort,
  initialTag,
  initialSearch,
  initialTotalPages,
  basePath,
  variant = "list",
  totalServers = 0,
  onlineServers = 0,
  activePlayers = 0,
}: HomePageClientProps) {
  const router = useRouter();
  const { status } = useSession();
  const { toast } = useToast();
  const t = useTranslations("servers.list");
  const locale = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  const [servers, setServers] = useState<ServerListItem[]>(initialServers);
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(Math.max(1, initialTotalPages));
  const [resultTotal, setResultTotal] = useState(totalServers);
  const [favoriteServerIds, setFavoriteServerIds] = useState<string[]>([]);
  const [query, setQuery] = useState<QueryState>({
    page: initialPage,
    sort: initialSort,
    tag: initialTag,
    search: initialSearch,
  });

  const skipFirstFetchRef = useRef(true);

  const activeTag = query.tag || TAG_FILTER_VALUES[0];
  const buildUrl = useCallback(
    (nextQuery: QueryState) => {
      return `${basePath}${buildServerListPath(nextQuery)}`;
    },
    [basePath],
  );

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

        const payload = normalizeServerListResponse(await response.json());
        if (cancelled) {
          return;
        }

        setServers(payload.servers);
        setTotalPages(payload.totalPages);
        setResultTotal(payload.total);
      } catch {
        if (!cancelled) {
          setServers([]);
          setTotalPages(1);
          setResultTotal(0);
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

      if (/^\d{6}$/.test(trimmed)) {
        router.push(`/servers/${trimmed}`);
        return;
      }

      updateQuery({ search: nextSearch }, { resetPage: true });
    },
    [router, updateQuery],
  );

  const sort = useMemo(() => query.sort, [query.sort]);

  const featuredServer = useMemo(() => {
    if (variant !== "home") return null;
    return (
      initialServers.find((s) => s.status.online && s.isVerified) ||
      initialServers.find((s) => s.status.online) ||
      null
    );
  }, [initialServers, variant]);

  const isHome = variant === "home";

  useEffect(() => {
    if (!isHome) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [isHome]);

  const dateInfo = useMemo(() => {
    if (!isHome || !now) {
      return null;
    }
    const yearMonth = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
    }).format(now);
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(now);
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
    const endOfYear = new Date(now.getFullYear() + 1, 0, 1).getTime();
    const minutesIntoDay = now.getHours() * 60 + now.getMinutes();
    const minutesIntoMonth = (dayOfMonth - 1) * 24 * 60 + minutesIntoDay;
    const todayProgress = (minutesIntoDay / (24 * 60)) * 100;
    const monthProgress = (minutesIntoMonth / (daysInMonth * 24 * 60)) * 100;
    const yearProgress = ((now.getTime() - startOfYear) / (endOfYear - startOfYear)) * 100;
    return {
      yearMonth,
      day: dayOfMonth,
      weekday,
      todayProgress,
      monthProgress,
      yearProgress,
    };
  }, [isHome, locale, now]);

  const onlineRatio = totalServers > 0 ? (onlineServers / totalServers) * 100 : 0;
  const daySuffix = t("heroWidgetDaySuffix");

  return (
    <div>
      {isHome ? (
        <section className="player-hero player-hero-breakout">
          <div className="player-hero-bg" />
          <div className="player-hero-grain" />
          <div className="player-hero-inner">
            <div>
              <span className="player-hero-eyebrow">
                <span className="pulse" aria-hidden />
                {t("heroEyebrow", {
                  servers: formatNumber(onlineServers || totalServers),
                  players: formatNumber(activePlayers),
                })}
              </span>
              <h1>
                {t("heroTitleLeft")}{" "}
                <span className="highlight">{t("heroTitleHighlight")}</span>{" "}
                {t("heroTitleTrail")}
              </h1>
              <p className="player-hero-lede">{t("heroSubtext")}</p>
              <div className="player-hero-ctas">
                <Link
                  href="/servers"
                  className="m3-btn m3-btn-primary inline-flex h-10 items-center gap-2 px-4"
                >
                  {t("heroBrowseCta")}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </Link>
                <Link
                  href="/submit"
                  className="m3-btn m3-btn-tonal inline-flex h-10 items-center px-4"
                >
                  {t("heroSubmitCta")}
                </Link>
              </div>
              <div className="player-hero-stats">
                <div className="player-hero-stat">
                  <div className="num">{formatNumber(totalServers)}</div>
                  <div className="lbl">{t("heroStatServers")}</div>
                </div>
                <div className="player-hero-stat">
                  <div className="num">{formatNumber(activePlayers)}</div>
                  <div className="lbl">{t("heroStatPlayers")}</div>
                </div>
                <div className="player-hero-stat">
                  <div className="num">{formatNumber(onlineServers)}</div>
                  <div className="lbl">{t("heroStatOnline")}</div>
                </div>
              </div>
            </div>
            <aside className="hero-widget-stack" aria-label={t("heroWidgetPulseLabel")}>
              <div className="hero-widget hero-widget-date">
                <div className="hero-widget-date-left">
                  <div className="hero-widget-date-yearmonth">
                    {dateInfo?.yearMonth ?? " "}
                  </div>
                  <div className="hero-widget-date-day">
                    <span className="num">{dateInfo?.day ?? "—"}</span>
                    {daySuffix ? <span className="suffix">{daySuffix}</span> : null}
                  </div>
                  <div className="hero-widget-date-weekday">
                    {dateInfo?.weekday ?? " "}
                  </div>
                </div>
                <div className="hero-widget-progress">
                  <div
                    className="hero-widget-progress-row"
                    data-tone="today"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(dateInfo?.todayProgress ?? 0)}
                    aria-label={t("heroWidgetTodayLabel")}
                  >
                    <span className="hero-widget-progress-label">
                      {t("heroWidgetTodayLabel")}
                    </span>
                    <span className="hero-widget-progress-bar">
                      <span style={{ width: `${dateInfo?.todayProgress ?? 0}%` }} />
                    </span>
                    <span className="hero-widget-progress-pct">
                      {dateInfo ? `${dateInfo.todayProgress.toFixed(1)}%` : "—"}
                    </span>
                  </div>
                  <div
                    className="hero-widget-progress-row"
                    data-tone="month"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(dateInfo?.monthProgress ?? 0)}
                    aria-label={t("heroWidgetMonthLabel")}
                  >
                    <span className="hero-widget-progress-label">
                      {t("heroWidgetMonthLabel")}
                    </span>
                    <span className="hero-widget-progress-bar">
                      <span style={{ width: `${dateInfo?.monthProgress ?? 0}%` }} />
                    </span>
                    <span className="hero-widget-progress-pct">
                      {dateInfo ? `${dateInfo.monthProgress.toFixed(1)}%` : "—"}
                    </span>
                  </div>
                  <div
                    className="hero-widget-progress-row"
                    data-tone="year"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(dateInfo?.yearProgress ?? 0)}
                    aria-label={t("heroWidgetYearLabel")}
                  >
                    <span className="hero-widget-progress-label">
                      {t("heroWidgetYearLabel")}
                    </span>
                    <span className="hero-widget-progress-bar">
                      <span style={{ width: `${dateInfo?.yearProgress ?? 0}%` }} />
                    </span>
                    <span className="hero-widget-progress-pct">
                      {dateInfo ? `${dateInfo.yearProgress.toFixed(1)}%` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="hero-widget hero-widget-pulse">
                <div className="hero-widget-pulse-head">
                  <span className="hero-widget-pulse-dot" aria-hidden />
                  <span className="label">{t("heroWidgetPulseLabel")}</span>
                  <span className="hint">{t("heroWidgetPulseHint")}</span>
                </div>
                <div className="hero-widget-pulse-grid">
                  <div className="hero-widget-pulse-cell">
                    <div className="num">{formatNumber(onlineServers)}</div>
                    <div className="lbl">{t("heroWidgetStatOnlineServers")}</div>
                  </div>
                  <div className="hero-widget-pulse-cell">
                    <div className="num">{formatNumber(activePlayers)}</div>
                    <div className="lbl">{t("heroWidgetStatActivePlayers")}</div>
                  </div>
                  <div className="hero-widget-pulse-cell">
                    <div className="num">{formatNumber(totalServers)}</div>
                    <div className="lbl">{t("heroWidgetStatTotalServers")}</div>
                  </div>
                  <div className="hero-widget-pulse-cell">
                    <div className="num">{`${onlineRatio.toFixed(0)}%`}</div>
                    <div className="lbl">{t("heroWidgetStatOnlineRatio")}</div>
                  </div>
                </div>
              </div>

              {featuredServer ? (
                <Link
                  href={`/servers/${featuredServer.psid}`}
                  aria-label={featuredServer.name}
                  className="hero-widget hero-widget-featured no-underline"
                >
                  <div className="hero-widget-featured-head">
                    <span className="hero-widget-featured-spark" aria-hidden />
                    <span className="label">{t("heroWidgetFeaturedHeading")}</span>
                    <span className="hero-widget-featured-online">
                      <span className="dot" aria-hidden />
                      {featuredServer.status.playerCount}/{featuredServer.status.maxPlayers}
                    </span>
                  </div>
                  <div className="hero-widget-featured-body">
                    <div
                      className={`hero-widget-featured-cover ${pickCoverClass(featuredServer.tags)}`}
                    />
                    <div className="hero-widget-featured-meta">
                      <h3 className="hero-widget-featured-name">{featuredServer.name}</h3>
                      <div className="hero-widget-featured-host">
                        {featuredServer.host === "hidden" || !featuredServer.host
                          ? t("heroAddressHidden")
                          : featuredServer.port === 25565
                            ? featuredServer.host
                            : `${featuredServer.host}:${featuredServer.port}`}
                      </div>
                    </div>
                  </div>
                </Link>
              ) : null}
            </aside>
          </div>
        </section>
      ) : (
        <section className="player-list-head">
          <div>
            <h1>{t("heroTitle")}</h1>
            <p>{t("heroSubtitle")}</p>
          </div>
          <div className="player-list-head-count">{t("resultsCount", { count: resultTotal })}</div>
        </section>
      )}

      <section className={isHome ? "player-section" : ""}>
        {isHome ? (
          <div className="player-section-head">
            <div>
              <h2>{t("browseTitle")}</h2>
              <p className="sub">{t("browseSubtitle")}</p>
            </div>
            <Link href="/servers" className="player-section-head-link">
              {t("browseViewAll")}
            </Link>
          </div>
        ) : null}

        <div className={isHome ? "" : "mb-4"}>
          {!isHome ? (
            <div className="mb-4 max-w-lg">
              <SearchBar onSearch={handleSearch} initialValue={query.search} />
            </div>
          ) : null}
          <div className="player-filter-rail scrollbar-hide overflow-x-auto">
            {TAG_FILTER_KEYS.map((key, index) => {
              const value = TAG_FILTER_VALUES[index];
              const isAll = value === TAG_FILTER_VALUES[0];
              const swatch = TAG_FILTER_SWATCHES[value];
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    updateQuery({ tag: isAll ? "" : value }, { resetPage: true });
                  }}
                  className={`mode-chip ${value === activeTag ? "mode-chip-active" : ""}`}
                >
                  {!isAll && swatch ? (
                    <span
                      className="swatch"
                      style={{ ["--swatch" as string]: swatch }}
                      aria-hidden
                    />
                  ) : null}
                  {t(key)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="player-toolbar">
          <p className="player-toolbar-count" aria-live="polite">
            {isHome ? t("resultsCount", { count: resultTotal }) : query.search ? query.search : ""}
          </p>
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
          <div className="player-grid">
            {servers.map((server, index) => (
              <ServerCard
                key={server.id}
                server={server}
                featured={isHome && index === 0}
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
      </section>
    </div>
  );
}
