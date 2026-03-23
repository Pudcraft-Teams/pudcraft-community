"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CircleCard } from "@/components/forum/CircleCard";
import { PostCard } from "@/components/forum/PostCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { PageLoading } from "@/components/PageLoading";
import type { CircleItem, PostItem, PostFeedResponse, CircleListResponse } from "@/lib/types";

/**
 * Homepage feed -- shows a post feed with cursor pagination
 * and a sidebar with popular / user circles.
 */
export function FeedPage() {
  const { status: sessionStatus } = useSession();

  // ── Post feed state ──
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // ── Sidebar state ──
  const [popularCircles, setPopularCircles] = useState<CircleItem[]>([]);
  const [myCircles, setMyCircles] = useState<CircleItem[]>([]);
  const [circlesLoading, setCirclesLoading] = useState(true);

  // ── Fetch initial posts ──
  useEffect(() => {
    let cancelled = false;

    async function fetchPosts() {
      try {
        const res = await fetch("/api/posts?limit=20");
        if (!res.ok) throw new Error("Failed to fetch posts");
        const data = (await res.json()) as PostFeedResponse;
        if (cancelled) return;

        setPosts(data.posts);
        setNextCursor(data.nextCursor);
      } catch {
        if (!cancelled) {
          setPosts([]);
          setNextCursor(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchPosts();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load more posts ──
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/posts?limit=20&cursor=${encodeURIComponent(nextCursor)}`);
      if (!res.ok) throw new Error("Failed to load more");
      const data = (await res.json()) as PostFeedResponse;

      setPosts((prev) => [...prev, ...data.posts]);
      setNextCursor(data.nextCursor);
    } catch {
      // silently fail -- user can retry
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore]);

  // ── Fetch sidebar circles ──
  useEffect(() => {
    let cancelled = false;

    async function fetchCircles() {
      setCirclesLoading(true);
      try {
        const res = await fetch("/api/circles?sort=popular&limit=5");
        if (!res.ok) throw new Error("Failed to fetch circles");
        const data = (await res.json()) as CircleListResponse;
        if (cancelled) return;

        setPopularCircles(data.circles);

        // Extract user's circles from the same response (isMember == true)
        if (sessionStatus === "authenticated") {
          const joined = data.circles.filter(
            (c) => c.isMember,
          );
          setMyCircles(joined);
        }
      } catch {
        if (!cancelled) {
          setPopularCircles([]);
        }
      } finally {
        if (!cancelled) {
          setCirclesLoading(false);
        }
      }
    }

    void fetchCircles();

    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  // ── Update handlers for optimistic UI ──
  const handleLikeChange = useCallback(
    (postId: string, liked: boolean, likeCount: number) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLiked: liked, likeCount } : p,
        ),
      );
    },
    [],
  );

  const handleBookmarkChange = useCallback(
    (postId: string, bookmarked: boolean) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isBookmarked: bookmarked } : p,
        ),
      );
    },
    [],
  );

  // ── Sidebar content (reused in both mobile and desktop) ──
  function renderSidebarContent() {
    return (
      <>
        {/* Popular circles */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-warm-800">
              热门圈子
            </h2>
            <Link href="/explore" className="text-xs m3-link">
              查看全部
            </Link>
          </div>
          {circlesLoading ? (
            <div className="flex justify-center py-6">
              <LoadingSpinner size="sm" />
            </div>
          ) : popularCircles.length === 0 ? (
            <p className="py-4 text-center text-xs text-warm-400">暂无圈子</p>
          ) : (
            <div className="flex flex-col gap-2">
              {popularCircles.map((circle) => (
                <CircleCard
                  key={circle.id}
                  circle={circle}
                  isMember={
                    circle.isMember
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* My circles (logged-in only) */}
        {sessionStatus === "authenticated" && myCircles.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-warm-800">
              我的圈子
            </h2>
            <div className="flex flex-col gap-2">
              {myCircles.map((circle) => (
                <CircleCard
                  key={circle.id}
                  circle={circle}
                  isMember
                />
              ))}
            </div>
          </div>
        )}

        {/* Create circle link */}
        <div className="mt-4">
          <Link
            href="/circles/create"
            className="m3-btn m3-btn-tonal flex w-full items-center justify-center gap-1.5 text-xs"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            创建圈子
          </Link>
        </div>
      </>
    );
  }

  return (
    <div>
      {/* ── Hero ── */}
      <section className="mb-6 pt-2">
        <h1 className="text-2xl font-bold tracking-tight text-warm-800">
          社区动态
        </h1>
        <p className="mt-1.5 text-sm text-warm-500">
          来自各个圈子的最新帖子
        </p>
      </section>

      {/* ── Mobile: sidebar as horizontal scroll ── */}
      <div className="mb-6 lg:hidden">
        <h2 className="mb-2 text-sm font-semibold text-warm-800">热门圈子</h2>
        {circlesLoading ? (
          <div className="flex justify-center py-4">
            <LoadingSpinner size="sm" />
          </div>
        ) : popularCircles.length === 0 ? (
          <p className="py-2 text-xs text-warm-400">暂无圈子</p>
        ) : (
          <div className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
            {popularCircles.map((circle) => (
              <div key={circle.id} className="w-56 shrink-0 sm:w-64">
                <CircleCard
                  circle={circle}
                  isMember={
                    circle.isMember
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Two-column layout ── */}
      <div className="flex gap-8">
        {/* Main feed */}
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <PageLoading text="加载动态中..." />
          ) : posts.length === 0 ? (
            <EmptyState
              title="暂无帖子"
              description="还没有人发布帖子，加入圈子开始讨论吧"
              action={{ label: "浏览圈子", href: "/explore" }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onLikeChange={handleLikeChange}
                  onBookmarkChange={handleBookmarkChange}
                />
              ))}

              {/* Load more */}
              {nextCursor && (
                <div className="mt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="m3-btn m3-btn-tonal inline-flex items-center gap-2"
                  >
                    {isLoadingMore ? (
                      <>
                        <LoadingSpinner size="sm" />
                        加载中...
                      </>
                    ) : (
                      "加载更多"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden w-80 shrink-0 lg:block">
          <div className="sticky top-[72px]">
            {renderSidebarContent()}
          </div>
        </aside>
      </div>
    </div>
  );
}
