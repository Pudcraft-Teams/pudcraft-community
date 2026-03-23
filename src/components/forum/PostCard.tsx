"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { normalizeImageSrc } from "@/lib/image-url";
import { timeAgo } from "@/lib/time";

import type { PostItem } from "@/lib/types";

interface PostCardProps {
  post: PostItem;
  onLikeChange?: (postId: string, liked: boolean, likeCount: number) => void;
  onBookmarkChange?: (postId: string, bookmarked: boolean) => void;
}

/**
 * 帖子卡片 —— 在 Feed 流中展示帖子标题、预览、作者及互动按钮。
 * 点赞与收藏按钮使用乐观更新，失败时回退。
 */
export function PostCard({ post, onLikeChange, onBookmarkChange }: PostCardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status: sessionStatus } = useSession();

  const [liked, setLiked] = useState(post.isLiked ?? false);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [likePending, setLikePending] = useState(false);

  const [bookmarked, setBookmarked] = useState(post.isBookmarked ?? false);
  const [bookmarkPending, setBookmarkPending] = useState(false);

  const postHref = post.circle
    ? `/c/${post.circle.slug}/post/${post.id}`
    : `/post/${post.id}`;

  /* ── guard: redirect to login if unauthenticated ── */
  function requireAuth(): boolean {
    if (sessionStatus === "loading") return false;
    if (sessionStatus !== "authenticated") {
      const callbackUrl = pathname && pathname.length > 0 ? pathname : "/";
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return false;
    }
    return true;
  }

  /* ── like toggle ── */
  async function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (likePending) return;
    if (!requireAuth()) return;

    const prevLiked = liked;
    const prevCount = likeCount;
    const nextLiked = !prevLiked;
    const nextCount = prevCount + (nextLiked ? 1 : -1);

    setLiked(nextLiked);
    setLikeCount(nextCount);
    onLikeChange?.(post.id, nextLiked, nextCount);
    setLikePending(true);

    try {
      const res = await fetch(`/api/posts/${post.id}/like`, {
        method: nextLiked ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setLiked(prevLiked);
        setLikeCount(prevCount);
        onLikeChange?.(post.id, prevLiked, prevCount);
      }
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      onLikeChange?.(post.id, prevLiked, prevCount);
    } finally {
      setLikePending(false);
    }
  }

  /* ── bookmark toggle ── */
  async function handleBookmark(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (bookmarkPending) return;
    if (!requireAuth()) return;

    const prevBookmarked = bookmarked;
    const nextBookmarked = !prevBookmarked;

    setBookmarked(nextBookmarked);
    onBookmarkChange?.(post.id, nextBookmarked);
    setBookmarkPending(true);

    try {
      const res = await fetch(`/api/posts/${post.id}/bookmark`, {
        method: nextBookmarked ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setBookmarked(prevBookmarked);
        onBookmarkChange?.(post.id, prevBookmarked);
      }
    } catch {
      setBookmarked(prevBookmarked);
      onBookmarkChange?.(post.id, prevBookmarked);
    } finally {
      setBookmarkPending(false);
    }
  }

  return (
    <Link
      href={postHref}
      className="group block rounded-xl border border-warm-200 bg-surface p-4 transition-colors hover:border-warm-300 animate-card-in"
    >
      {/* ── Header: avatar + name + time + circle tag + pin ── */}
      <div className="mb-2 flex items-center gap-1.5 overflow-hidden sm:gap-2">
        <span className="relative inline-flex h-7 w-7 shrink-0 overflow-hidden rounded-full sm:h-8 sm:w-8">
          <Image
            src={normalizeImageSrc(post.author.image) || "/default-avatar.png"}
            alt={post.author.name ?? "用户头像"}
            width={32}
            height={32}
            className="h-full w-full object-cover"
          />
        </span>

        <span className="min-w-0 max-w-[6rem] truncate text-sm font-medium text-warm-800 sm:max-w-none">
          {post.author.name ?? `用户${post.author.uid}`}
        </span>

        <span className="shrink-0 text-xs text-warm-400">
          {timeAgo(post.createdAt)}
        </span>

        {post.circle ? (
          <span className="max-w-[5rem] truncate rounded-full bg-warm-100 px-2 py-0.5 text-xs text-warm-500 sm:max-w-none">
            {post.circle.name}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-warm-100 px-2 py-0.5 text-xs text-warm-500">
            广场
          </span>
        )}

        {post.isPinned && (
          <span className="ml-auto flex shrink-0 items-center gap-0.5 text-xs text-accent">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path d="M10.97 2.22a.75.75 0 0 1 1.06 0l1.75 1.75a.75.75 0 0 1-.177 1.206l-2.12 1.06-.757.757 1.024 1.024a.75.75 0 1 1-1.06 1.06L9.664 8.06l-2.476 2.476a.75.75 0 0 1-.53.22H5.25a.75.75 0 0 1-.53-.22l-.5-.5a.75.75 0 0 1 0-1.06l2.476-2.476L5.67 5.474a.75.75 0 0 1 1.06-1.06L7.756 5.44l.757-.757 1.06-2.12a.75.75 0 0 1 .177-.122l1.22-.22Z" />
            </svg>
            置顶
          </span>
        )}
      </div>

      {/* ── Title ── */}
      {post.title && (
        <h3 className="mb-1 text-base font-semibold text-warm-800 transition-colors group-hover:text-accent">
          {post.title}
        </h3>
      )}

      {/* ── Content preview ── */}
      {post.contentPreview && (
        <p className={`line-clamp-2 text-sm leading-relaxed ${post.title ? "mb-3 text-warm-500" : "mb-3 text-warm-700"}`}>
          {post.contentPreview}
        </p>
      )}

      {/* ── Image preview ── */}
      {post.images?.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-hidden rounded-lg">
          {post.images.slice(0, 3).map((url, i) => (
            <div key={i} className="relative aspect-square flex-1 overflow-hidden bg-warm-100">
              <img
                src={normalizeImageSrc(url) || url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
              {i === 2 && post.images.length > 3 && (
                <div className="absolute inset-0 flex items-center justify-center bg-warm-900/40 text-sm font-medium text-white">
                  +{post.images.length - 3}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Action bar ── */}
      <div className="flex items-center gap-4 text-sm text-warm-400">
        {/* Like */}
        <button
          type="button"
          onClick={handleLike}
          disabled={likePending}
          className={`inline-flex items-center gap-1 transition-colors hover:text-accent disabled:cursor-not-allowed ${
            liked ? "text-accent" : ""
          }`}
          aria-label={liked ? "取消点赞" : "点赞"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill={liked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={liked ? 0 : 1.5}
            className="h-4 w-4"
          >
            <path d="M2 10.5a1.5 1.5 0 1 1 3 0v6a1.5 1.5 0 0 1-3 0v-6ZM6 10.333v5.43a2 2 0 0 0 1.106 1.79l.05.025A4 4 0 0 0 8.943 18h5.416a2 2 0 0 0 1.962-1.608l1.2-6A2 2 0 0 0 15.56 8H12V4a2 2 0 0 0-2-2 1 1 0 0 0-1 1v.667a4 4 0 0 1-.8 2.4L6.8 7.933a4 4 0 0 0-.8 2.4Z" />
          </svg>
          <span className="tabular-nums">{likeCount}</span>
        </button>

        {/* Comment count */}
        <span className="inline-flex items-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3V5Z"
            />
          </svg>
          <span className="tabular-nums">{post.commentCount}</span>
        </span>

        {/* View count */}
        <span className="inline-flex items-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 4.5C5.5 4.5 2 10 2 10s3.5 5.5 8 5.5 8-5.5 8-5.5-3.5-5.5-8-5.5Z"
            />
            <circle cx="10" cy="10" r="2.5" />
          </svg>
          <span className="tabular-nums">{post.viewCount}</span>
        </span>

        {/* Bookmark */}
        <button
          type="button"
          onClick={handleBookmark}
          disabled={bookmarkPending}
          className={`ml-auto inline-flex items-center gap-1 transition-colors hover:text-accent disabled:cursor-not-allowed ${
            bookmarked ? "text-accent" : ""
          }`}
          aria-label={bookmarked ? "取消收藏" : "收藏"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill={bookmarked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={bookmarked ? 0 : 1.5}
            className="h-4 w-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 3a2 2 0 0 0-2 2v12l7-4 7 4V5a2 2 0 0 0-2-2H5Z"
            />
          </svg>
        </button>
      </div>
    </Link>
  );
}
