"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PostCard } from "@/components/forum/PostCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { normalizeImageSrc } from "@/lib/image-url";
import type { PostItem } from "@/lib/types";

interface TagInfo {
  name: string;
  displayName: string;
  postCount: number;
}

interface UserResult {
  id: string;
  uid: number;
  name: string | null;
  image: string | null;
}

interface SearchResponse {
  type: "tag" | "mention" | "text";
  tag?: TagInfo | null;
  users?: UserResult[];
  posts: PostItem[];
  nextCursor: string | null;
}

/**
 * Search page component.
 * Reads `q` from URL search params and fetches results from /api/search.
 * Supports tag (#), user (@), and text search with cursor pagination.
 */
export function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(q);
  const [searchType, setSearchType] = useState<"tag" | "mention" | "text" | null>(null);
  const [tag, setTag] = useState<TagInfo | null>(null);
  const [users, setUsers] = useState<UserResult[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Sync input with URL param changes
  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  // Fetch results when q changes
  useEffect(() => {
    if (!q) {
      setSearchType(null);
      setTag(null);
      setUsers([]);
      setPosts([]);
      setNextCursor(null);
      return;
    }

    let cancelled = false;

    async function fetchResults() {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=20`,
        );
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as SearchResponse;
        if (cancelled) return;

        setSearchType(data.type);
        setTag(data.tag ?? null);
        setUsers(data.users ?? []);
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
      } catch {
        if (!cancelled) {
          setSearchType(null);
          setTag(null);
          setUsers([]);
          setPosts([]);
          setNextCursor(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchResults();

    return () => {
      cancelled = true;
    };
  }, [q]);

  // Load more posts (cursor pagination)
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore || !q) return;

    setIsLoadingMore(true);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&limit=20&cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (!res.ok) throw new Error("Failed to load more");
      const data = (await res.json()) as SearchResponse;

      setPosts((prev) => [...prev, ...data.posts]);
      setNextCursor(data.nextCursor);
    } catch {
      // silently fail -- user can retry
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, q]);

  // Handle search form submit
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Search form */}
      <form onSubmit={handleSearch} className="mb-6">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜索帖子、#话题 或 @用户..."
          className="m3-input w-full"
          autoFocus
        />
      </form>

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner text="搜索中..." />
        </div>
      )}

      {/* No query entered yet */}
      {!q && !isLoading && (
        <EmptyState
          title="输入关键词开始搜索"
          description="搜索帖子内容，使用 # 搜索话题，使用 @ 搜索用户"
        />
      )}

      {/* Results */}
      {!isLoading && q && searchType === "tag" && (
        <TagSearchResults
          tag={tag}
          posts={posts}
          nextCursor={nextCursor}
          isLoadingMore={isLoadingMore}
          onLoadMore={handleLoadMore}
        />
      )}

      {!isLoading && q && searchType === "mention" && (
        <UserSearchResults users={users} />
      )}

      {!isLoading && q && searchType === "text" && (
        <TextSearchResults
          posts={posts}
          nextCursor={nextCursor}
          isLoadingMore={isLoadingMore}
          onLoadMore={handleLoadMore}
        />
      )}
    </div>
  );
}

// ── Tag search results ──

function TagSearchResults({
  tag,
  posts,
  nextCursor,
  isLoadingMore,
  onLoadMore,
}: {
  tag: TagInfo | null;
  posts: PostItem[];
  nextCursor: string | null;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (!tag) {
    return <EmptyState title="未找到该话题" description="该话题不存在或尚无帖子" />;
  }

  return (
    <>
      {/* Tag info card */}
      <div className="m3-surface mb-4 p-4">
        <span className="text-lg font-semibold text-accent">
          #{tag.displayName}
        </span>
        <span className="ml-2 text-sm text-warm-400">
          {tag.postCount} 篇帖子
        </span>
      </div>

      {/* Post list */}
      {posts.length === 0 ? (
        <EmptyState title="暂无帖子" description="该话题下还没有帖子" />
      ) : (
        <PostList
          posts={posts}
          nextCursor={nextCursor}
          isLoadingMore={isLoadingMore}
          onLoadMore={onLoadMore}
        />
      )}
    </>
  );
}

// ── User search results ──

function UserSearchResults({ users }: { users: UserResult[] }) {
  if (users.length === 0) {
    return <EmptyState title="未找到用户" description="没有匹配的用户" />;
  }

  return (
    <div className="space-y-2">
      {users.map((user) => (
        <Link
          key={user.id}
          href={`/u/${user.uid}`}
          className="flex items-center gap-3 rounded-xl border border-warm-200 bg-surface p-3 transition-colors hover:border-warm-300"
        >
          <span className="relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
            <Image
              src={normalizeImageSrc(user.image) || "/default-avatar.png"}
              alt={user.name ?? "用户头像"}
              width={40}
              height={40}
              className="h-full w-full object-cover"
            />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-warm-800">
              {user.name ?? `用户${user.uid}`}
            </p>
            <p className="text-xs text-warm-400">UID: {user.uid}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Text search results ──

function TextSearchResults({
  posts,
  nextCursor,
  isLoadingMore,
  onLoadMore,
}: {
  posts: PostItem[];
  nextCursor: string | null;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (posts.length === 0) {
    return <EmptyState title="未找到相关帖子" description="尝试使用其他关键词搜索" />;
  }

  return (
    <PostList
      posts={posts}
      nextCursor={nextCursor}
      isLoadingMore={isLoadingMore}
      onLoadMore={onLoadMore}
    />
  );
}

// ── Shared post list with load-more ──

function PostList({
  posts,
  nextCursor,
  isLoadingMore,
  onLoadMore,
}: {
  posts: PostItem[];
  nextCursor: string | null;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <>
      <div className="space-y-3">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>

      {nextCursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="m3-btn m3-btn-tonal"
          >
            {isLoadingMore ? (
              <LoadingSpinner size="sm" text="加载中..." />
            ) : (
              "加载更多"
            )}
          </button>
        </div>
      )}
    </>
  );
}
