"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CircleCard } from "@/components/forum/CircleCard";
import { EmptyState } from "@/components/EmptyState";
import { PageLoading } from "@/components/PageLoading";
import { Pagination } from "@/components/Pagination";
import { useToast } from "@/hooks/useToast";
import type { CircleItem, CircleListResponse } from "@/lib/types";

type CircleSort = "popular" | "newest";

const SORT_OPTIONS: Array<{ value: CircleSort; label: string }> = [
  { value: "popular", label: "热门" },
  { value: "newest", label: "最新" },
];

const DEFAULT_LIMIT = 20;

/**
 * 圈子发现页 —— 搜索、排序、分页展示所有圈子。
 */
export function ExplorePage() {
  const { status } = useSession();
  const { toast } = useToast();

  const [circles, setCircles] = useState<CircleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<CircleSort>("popular");
  const [isLoading, setIsLoading] = useState(true);

  const isFirstRender = useRef(true);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch circles
  useEffect(() => {
    let cancelled = false;

    async function fetchCircles() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(DEFAULT_LIMIT));
        params.set("sort", sort);
        if (debouncedSearch) {
          params.set("search", debouncedSearch);
        }

        const res = await fetch(`/api/circles?${params.toString()}`);
        if (!res.ok) {
          throw new Error("加载失败");
        }

        const data = (await res.json()) as CircleListResponse;
        if (cancelled) return;

        setCircles(data.circles);
        setTotal(data.total);
        setTotalPages(Math.max(1, data.totalPages));
      } catch {
        if (!cancelled) {
          setCircles([]);
          setTotal(0);
          setTotalPages(1);
          toast.error("圈子列表加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchCircles();

    return () => {
      cancelled = true;
    };
  }, [page, sort, debouncedSearch, toast]);

  // Skip triggering search reset on first render
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
  }, []);

  const handleSortChange = useCallback((nextSort: CircleSort) => {
    setSort(nextSort);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((nextPage: number) => {
    setPage(nextPage);
  }, []);

  const handleJoinChange = useCallback((circleId: string, joined: boolean) => {
    setCircles((prev) =>
      prev.map((c) =>
        c.id === circleId
          ? { ...c, memberCount: c.memberCount + (joined ? 1 : -1) }
          : c,
      ),
    );
  }, []);

  return (
    <div>
      {/* Header */}
      <section className="mb-6 pt-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-warm-800">
              探索圈子
            </h1>
            <p className="mt-1.5 text-sm text-warm-500">
              发现感兴趣的游戏圈子，加入讨论
            </p>
          </div>

          {status === "authenticated" && (
            <Link
              href="/circles/create"
              className="m3-btn m3-btn-primary inline-flex shrink-0 items-center gap-1.5 self-start"
            >
              <span className="text-base leading-none">+</span>
              创建圈子
            </Link>
          )}
        </div>

        {/* Search + Sort */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="relative max-w-lg flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索圈子名称..."
              className="m3-input w-full px-4"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 transition-colors hover:text-warm-800"
                aria-label="清空搜索"
              >
                &times;
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-warm-600">排序：</span>
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSortChange(option.value)}
                className={`m3-chip ${sort === option.value ? "m3-chip-active" : ""}`}
                aria-pressed={sort === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Content */}
      {isLoading ? (
        <PageLoading />
      ) : circles.length === 0 ? (
        <EmptyState
          title="暂无圈子"
          description={
            debouncedSearch
              ? "没有找到匹配的圈子，试试其他关键词"
              : "还没有圈子，快来创建第一个吧"
          }
          action={
            status === "authenticated"
              ? { label: "创建圈子", href: "/circles/create" }
              : undefined
          }
        />
      ) : (
        <>
          {total > 0 && (
            <p className="mb-4 text-sm text-warm-400">
              共 {total} 个圈子
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {circles.map((circle) => (
              <CircleCard
                key={circle.id}
                circle={circle}
                isMember={circle.isMember}
                onJoinChange={handleJoinChange}
              />
            ))}
          </div>
        </>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
