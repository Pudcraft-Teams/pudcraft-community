"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { PageLoading } from "@/components/PageLoading";
import { PostCard } from "@/components/forum/PostCard";
import { normalizeImageSrc } from "@/lib/image-url";
import { timeAgo } from "@/lib/time";

import type {
  CircleDetail,
  PostItem,
  PostFeedResponse,
  SectionItem,
} from "@/lib/types";

interface CirclePageProps {
  slug: string;
}

/**
 * Circle homepage -- shows banner, info, section tabs, and post feed.
 */
export function CirclePage({ slug }: CirclePageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status: sessionStatus } = useSession();

  // ── State ──
  const [circle, setCircle] = useState<CircleDetail | null>(null);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [joinPending, setJoinPending] = useState(false);

  // ── Fetch circle detail ──
  const fetchCircle = useCallback(async () => {
    const res = await fetch(`/api/circles/${slug}`);
    if (!res.ok) {
      if (res.status === 404) {
        setError("圈子不存在");
      } else {
        setError("加载圈子失败");
      }
      return null;
    }
    const json = (await res.json()) as { data: CircleDetail };
    return json.data;
  }, [slug]);

  // ── Fetch sections ──
  const fetchSections = useCallback(
    async (circleId: string) => {
      try {
        const res = await fetch(`/api/circles/${circleId}/sections`);
        if (!res.ok) return [];
        const json = (await res.json()) as { sections: SectionItem[] };
        return json.sections;
      } catch {
        return [];
      }
    },
    [],
  );

  // ── Fetch posts ──
  const fetchPosts = useCallback(
    async (circleId: string, sectionId: string | null, cursor?: string) => {
      const params = new URLSearchParams();
      params.set("circleId", circleId);
      if (sectionId) {
        params.set("sectionId", sectionId);
      }
      if (cursor) {
        params.set("cursor", cursor);
      }
      params.set("limit", "20");

      const res = await fetch(`/api/posts?${params.toString()}`);
      if (!res.ok) return { posts: [], nextCursor: null } as PostFeedResponse;
      return (await res.json()) as PostFeedResponse;
    },
    [],
  );

  // ── Initial load ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      const circleData = await fetchCircle();
      if (cancelled || !circleData) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      setCircle(circleData);

      const [sectionData, postData] = await Promise.all([
        fetchSections(circleData.id),
        fetchPosts(circleData.id, null),
      ]);

      if (cancelled) return;

      setSections(sectionData);
      setPosts(postData.posts);
      setNextCursor(postData.nextCursor);
      setIsLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [fetchCircle, fetchSections, fetchPosts]);

  // ── Section tab click ──
  const handleSectionChange = useCallback(
    async (sectionId: string | null) => {
      if (!circle || sectionId === activeSection) return;

      setActiveSection(sectionId);
      setIsLoadingMore(true);
      setPosts([]);
      setNextCursor(null);

      const data = await fetchPosts(circle.id, sectionId);
      setPosts(data.posts);
      setNextCursor(data.nextCursor);
      setIsLoadingMore(false);
    },
    [circle, activeSection, fetchPosts],
  );

  // ── Load more ──
  const handleLoadMore = useCallback(async () => {
    if (!circle || !nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    const data = await fetchPosts(circle.id, activeSection, nextCursor);
    setPosts((prev) => [...prev, ...data.posts]);
    setNextCursor(data.nextCursor);
    setIsLoadingMore(false);
  }, [circle, nextCursor, isLoadingMore, activeSection, fetchPosts]);

  // ── Join / Leave ──
  const handleJoinToggle = useCallback(async () => {
    if (!circle || joinPending) return;

    if (sessionStatus !== "authenticated") {
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname ?? `/c/${slug}`)}`);
      return;
    }

    const nextJoined = !circle.isMember;
    setJoinPending(true);

    // Optimistic update
    setCircle((prev) =>
      prev
        ? {
            ...prev,
            isMember: nextJoined,
            memberCount: prev.memberCount + (nextJoined ? 1 : -1),
          }
        : prev,
    );

    try {
      const res = await fetch(`/api/circles/${circle.id}/members`, {
        method: nextJoined ? "POST" : "DELETE",
      });
      if (!res.ok) {
        // Revert on failure
        setCircle((prev) =>
          prev
            ? {
                ...prev,
                isMember: !nextJoined,
                memberCount: prev.memberCount + (nextJoined ? -1 : 1),
              }
            : prev,
        );
      }
    } catch {
      setCircle((prev) =>
        prev
          ? {
              ...prev,
              isMember: !nextJoined,
              memberCount: prev.memberCount + (nextJoined ? -1 : 1),
            }
          : prev,
      );
    } finally {
      setJoinPending(false);
    }
  }, [circle, joinPending, sessionStatus, router, pathname, slug]);

  // ── Render: loading ──
  if (isLoading) return <PageLoading />;

  // ── Render: error ──
  if (error || !circle) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="m3-alert-error text-center">
          {error ?? "加载失败"}
        </div>
      </div>
    );
  }

  const isOwnerOrAdmin =
    circle.memberRole === "OWNER" || circle.memberRole === "ADMIN";

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12">
      {/* ── Banner ── */}
      <div className="relative h-[120px] w-full overflow-hidden rounded-b-2xl bg-warm-100 sm:h-[200px]">
        {circle.banner ? (
          <Image
            src={normalizeImageSrc(circle.banner)!}
            alt={`${circle.name} 横幅`}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent-muted to-warm-100">
            <span className="text-5xl font-bold text-accent/20">
              {circle.name}
            </span>
          </div>
        )}
      </div>

      {/* ── Circle header ── */}
      <div className="relative -mt-10 flex flex-col gap-4 px-2 sm:flex-row sm:items-end sm:gap-5">
        {/* Icon */}
        <div className="relative z-10 h-20 w-20 shrink-0 overflow-hidden rounded-xl border-4 border-surface bg-surface shadow-sm">
          {circle.icon ? (
            <Image
              src={normalizeImageSrc(circle.icon)!}
              alt={`${circle.name} 图标`}
              width={80}
              height={80}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent to-accent-hover text-2xl font-bold text-white">
              {circle.name.charAt(0)}
            </div>
          )}
        </div>

        {/* Info + actions */}
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-warm-800">{circle.name}</h1>
            {circle.description && (
              <p className="mt-0.5 text-sm text-warm-500">
                {circle.description}
              </p>
            )}
            <p className="mt-1 text-xs text-warm-400">
              {circle.memberCount} 成员
              <span className="mx-1.5">&middot;</span>
              {circle.postCount} 帖子
              <span className="mx-1.5">&middot;</span>
              创建于 {timeAgo(circle.createdAt)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleJoinToggle}
              disabled={joinPending}
              className={`m3-btn shrink-0 text-sm ${
                circle.isMember ? "m3-btn-tonal" : "m3-btn-primary"
              } ${joinPending ? "opacity-60" : ""}`}
            >
              {circle.isMember ? "已加入" : "加入圈子"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content area ── */}
      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {/* ── Left: Section tabs + Post feed ── */}
        <div className="flex-1 min-w-0">
          {/* Section tabs */}
          {sections.length > 0 && (
            <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-warm-100 p-1 scrollbar-hide">
              <button
                type="button"
                onClick={() => handleSectionChange(null)}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeSection === null
                    ? "bg-surface text-warm-800 shadow-sm"
                    : "text-warm-400 hover:text-warm-500"
                }`}
              >
                全部
              </button>
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => handleSectionChange(section.id)}
                  className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    activeSection === section.id
                      ? "bg-surface text-warm-800 shadow-sm"
                      : "text-warm-400 hover:text-warm-500"
                  }`}
                >
                  {section.name}
                </button>
              ))}
            </div>
          )}

          {/* Posts feed */}
          {isLoadingMore && posts.length === 0 ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="md" text="加载帖子中..." />
            </div>
          ) : posts.length === 0 ? (
            <EmptyState
              title="暂无帖子"
              description={
                circle.isMember
                  ? "成为第一个发帖的人吧"
                  : "加入圈子后即可发帖"
              }
              action={
                circle.isMember
                  ? { label: "发帖", href: `/c/${slug}/new` }
                  : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}

              {nextCursor && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="m3-btn m3-btn-tonal text-sm"
                  >
                    {isLoadingMore ? (
                      <LoadingSpinner size="sm" text="加载中..." />
                    ) : (
                      "加载更多"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right sidebar (desktop only) ── */}
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-20 space-y-4">
            {/* Circle stats card */}
            <div className="m3-surface p-4">
              <h3 className="mb-3 text-sm font-semibold text-warm-800">
                圈子信息
              </h3>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-warm-400">成员</dt>
                  <dd className="font-medium text-warm-800">
                    {circle.memberCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-warm-400">帖子</dt>
                  <dd className="font-medium text-warm-800">
                    {circle.postCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-warm-400">创建时间</dt>
                  <dd className="text-warm-500">
                    {new Date(circle.createdAt).toLocaleDateString("zh-CN")}
                  </dd>
                </div>
                {circle.creator && (
                  <div className="flex items-center justify-between">
                    <dt className="text-warm-400">创建者</dt>
                    <dd className="text-warm-500">
                      {circle.creator.name ?? `用户${circle.creator.uid}`}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Action buttons */}
            {circle.isMember && (
              <Link
                href={`/c/${slug}/new`}
                className="m3-btn m3-btn-primary flex w-full items-center justify-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                </svg>
                发帖
              </Link>
            )}

            {isOwnerOrAdmin && (
              <Link
                href={`/c/${slug}/settings`}
                className="m3-btn m3-btn-tonal flex w-full items-center justify-center gap-2 text-sm"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                    clipRule="evenodd"
                  />
                </svg>
                管理圈子
              </Link>
            )}
          </div>
        </aside>
      </div>

      {/* ── Mobile: floating create post button ── */}
      {circle.isMember && (
        <Link
          href={`/c/${slug}/new`}
          className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-105 active:scale-95 lg:hidden"
          aria-label="发帖"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-6 w-6"
          >
            <path
              fillRule="evenodd"
              d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
      )}
    </div>
  );
}
