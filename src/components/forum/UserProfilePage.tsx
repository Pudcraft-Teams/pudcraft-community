"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { normalizeImageSrc } from "@/lib/image-url";
import { PostCard } from "@/components/forum/PostCard";
import { CircleCard } from "@/components/forum/CircleCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";

import type { PostItem, PostFeedResponse, CircleItem } from "@/lib/types";

interface UserData {
  id: string;
  uid: number;
  name: string | null;
  image: string | null;
  bio: string | null;
  createdAt: string;
}

interface UserProfilePageProps {
  uid: string;
  user: UserData;
}

type TabType = "posts" | "circles";

interface CircleMembershipResponse {
  circles: CircleItem[];
}

function formatJoinTime(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(date);
}

function resolveDisplayName(name: string | null): string {
  return name?.trim() || "用户";
}

export function UserProfilePage({ uid, user }: UserProfilePageProps) {
  void uid; // reserved; user data is passed from server

  const displayName = resolveDisplayName(user.name);

  const [activeTab, setActiveTab] = useState<TabType>("posts");

  // Posts state
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false);

  // Circles state
  const [circles, setCircles] = useState<CircleItem[]>([]);
  const [isLoadingCircles, setIsLoadingCircles] = useState(false);
  const [circlesLoaded, setCirclesLoaded] = useState(false);

  // Fetch user's posts
  useEffect(() => {
    let cancelled = false;

    async function fetchPosts() {
      setIsLoadingPosts(true);

      try {
        const res = await fetch(
          `/api/posts?authorId=${encodeURIComponent(user.id)}&limit=20`,
        );
        const payload = (await res.json().catch(() => ({}))) as PostFeedResponse;

        if (cancelled) return;

        if (res.ok && Array.isArray(payload.posts)) {
          setPosts(payload.posts);
          setPostsNextCursor(payload.nextCursor ?? null);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) {
          setIsLoadingPosts(false);
        }
      }
    }

    void fetchPosts();

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Load more posts
  const loadMorePosts = useCallback(async () => {
    if (!postsNextCursor || isLoadingMorePosts) return;

    setIsLoadingMorePosts(true);

    try {
      const res = await fetch(
        `/api/posts?authorId=${encodeURIComponent(user.id)}&cursor=${encodeURIComponent(postsNextCursor)}&limit=20`,
      );
      const payload = (await res.json().catch(() => ({}))) as PostFeedResponse;

      if (res.ok && Array.isArray(payload.posts)) {
        setPosts((prev) => [...prev, ...payload.posts]);
        setPostsNextCursor(payload.nextCursor ?? null);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoadingMorePosts(false);
    }
  }, [user.id, postsNextCursor, isLoadingMorePosts]);

  // Fetch user's circles (lazy, on tab switch)
  useEffect(() => {
    if (activeTab !== "circles" || circlesLoaded) return;

    let cancelled = false;

    async function fetchCircles() {
      setIsLoadingCircles(true);

      try {
        const res = await fetch(
          `/api/users/${encodeURIComponent(user.id)}/circles`,
        );
        const payload = (await res.json().catch(() => ({}))) as CircleMembershipResponse;

        if (cancelled) return;

        if (res.ok && Array.isArray(payload.circles)) {
          setCircles(payload.circles);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) {
          setIsLoadingCircles(false);
          setCirclesLoaded(true);
        }
      }
    }

    void fetchCircles();

    return () => {
      cancelled = true;
    };
  }, [activeTab, circlesLoaded, user.id]);

  // Post interaction callbacks
  const handleLikeChange = (postId: string, liked: boolean, newLikeCount: number) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, isLiked: liked, likeCount: newLikeCount } : p,
      ),
    );
  };

  const handleBookmarkChange = (postId: string, newBookmarked: boolean) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, isBookmarked: newBookmarked } : p,
      ),
    );
  };

  const tabClasses = (tab: TabType) =>
    `px-4 py-2 text-sm font-medium transition-colors rounded-t-lg border-b-2 ${
      activeTab === tab
        ? "border-accent text-accent"
        : "border-transparent text-warm-500 hover:text-warm-700 hover:border-warm-300"
    }`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* ── Header ── */}
      <section className="m3-surface p-4 sm:p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <span className="relative inline-flex h-20 w-20 shrink-0 overflow-hidden rounded-full">
            <Image
              src={normalizeImageSrc(user.image) || "/default-avatar.png"}
              alt={`${displayName} 的头像`}
              width={80}
              height={80}
              className="h-full w-full object-cover"
            />
          </span>

          <div className="min-w-0 text-center sm:text-left">
            <h1 className="text-2xl font-semibold text-warm-800">
              {displayName}
            </h1>
            <p className="mt-1 text-xs text-warm-400">UID: {user.uid}</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-warm-600">
              {user.bio?.trim() || "这个用户还没有填写个人简介。"}
            </p>
            <p className="mt-2 text-xs text-warm-500">
              加入时间: {formatJoinTime(user.createdAt)}
            </p>
          </div>
        </div>
      </section>

      {/* ── Tabs ── */}
      <div className="mt-6 flex border-b border-warm-200">
        <button
          type="button"
          onClick={() => setActiveTab("posts")}
          className={tabClasses("posts")}
        >
          帖子
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("circles")}
          className={tabClasses("circles")}
        >
          圈子
        </button>
      </div>

      {/* ── Tab Content ── */}
      <div className="mt-4">
        {activeTab === "posts" && (
          <>
            {isLoadingPosts ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" text="加载中..." />
              </div>
            ) : posts.length === 0 ? (
              <EmptyState title="暂无帖子" description="该用户还没有发表帖子" />
            ) : (
              <div className="space-y-3">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onLikeChange={handleLikeChange}
                    onBookmarkChange={handleBookmarkChange}
                  />
                ))}

                {postsNextCursor && (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        void loadMorePosts();
                      }}
                      disabled={isLoadingMorePosts}
                      className="m3-btn m3-btn-tonal disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoadingMorePosts ? "加载中..." : "加载更多"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "circles" && (
          <>
            {isLoadingCircles ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" text="加载中..." />
              </div>
            ) : circles.length === 0 ? (
              <EmptyState
                title="暂无圈子"
                description="该用户还没有加入任何圈子"
              />
            ) : (
              <div className="space-y-3">
                {circles.map((circle) => (
                  <CircleCard key={circle.id} circle={circle} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
