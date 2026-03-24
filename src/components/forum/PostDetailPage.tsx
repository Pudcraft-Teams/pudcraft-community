"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useConfirm } from "@/components/ConfirmDialog";
import { PostContentRenderer } from "@/components/forum/PostContentRenderer";
import { normalizeImageSrc } from "@/lib/image-url";
import { ForumCommentSection } from "@/components/forum/ForumCommentSection";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/hooks/useToast";
import { timeAgo } from "@/lib/time";

import type { PostDetail, ForumComment, ForumCommentResponse } from "@/lib/types";

interface PostDetailPageProps {
  postId: string;
  circleSlug?: string;
}

interface PostDetailApiResponse {
  data?: PostDetail;
  error?: string;
}

interface PinToggleResponse {
  success?: boolean;
  isPinned?: boolean;
  error?: string;
}

interface DeleteResponse {
  success?: boolean;
  error?: string;
}


export function PostDetailPage({ postId, circleSlug }: PostDetailPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Like/bookmark/pin local state
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likePending, setLikePending] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [pinPending, setPinPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  // Comments state
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [commentNextCursor, setCommentNextCursor] = useState<string | null>(null);

  // Moderation state
  const [canModerate, setCanModerate] = useState(false);
  const [canComment, setCanComment] = useState(false);

  const userId = session?.user?.id;
  const isAdmin = session?.user?.role === "admin";

  // Fetch post detail
  useEffect(() => {
    let cancelled = false;

    async function fetchPost() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/posts/${postId}`);
        const payload = (await res.json().catch(() => ({}))) as PostDetailApiResponse;

        if (cancelled) return;

        if (!res.ok || !payload.data) {
          setError(payload.error ?? "加载帖子失败");
          return;
        }

        const postData = payload.data;
        setPost(postData);
        setLiked(postData.isLiked ?? false);
        setLikeCount(postData.likeCount);
        setBookmarked(postData.isBookmarked ?? false);
        setIsPinned(postData.isPinned);
      } catch {
        if (!cancelled) {
          setError("网络异常，加载帖子失败");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchPost();

    return () => {
      cancelled = true;
    };
  }, [postId]);

  // Fetch initial comments
  useEffect(() => {
    let cancelled = false;

    async function fetchComments() {
      try {
        const res = await fetch(`/api/posts/${postId}/comments`);
        const payload = (await res.json().catch(() => ({}))) as ForumCommentResponse;

        if (cancelled) return;

        if (res.ok && Array.isArray(payload.comments)) {
          setComments(payload.comments);
          setCommentNextCursor(payload.nextCursor ?? null);
        }
      } catch {
        // Comments failed to load silently; section will show empty
      }
    }

    void fetchComments();

    return () => {
      cancelled = true;
    };
  }, [postId]);

  // Determine moderation & comment permissions
  useEffect(() => {
    if (!post) return;

    if (isAdmin) {
      setCanModerate(true);
    }

    // For public (square) posts, any logged-in user can comment
    if (!post.circleId) {
      setCanComment(sessionStatus === "authenticated");
      return;
    }

    // For circle posts, check circle membership
    if (sessionStatus !== "authenticated" || !userId) {
      setCanComment(false);
      return;
    }

    let cancelled = false;

    async function checkCircleMembership() {
      try {
        const circleId = post?.circleId;
        if (!circleId) return;
        const res = await fetch(`/api/circles/${circleId}`);
        if (!res.ok) return;

        const payload = (await res.json()) as {
          data?: { isMember?: boolean; memberRole?: string | null };
        };

        if (cancelled) return;

        const isMember = payload.data?.isMember ?? false;
        const role = payload.data?.memberRole;

        setCanComment(isMember);

        if (role === "OWNER" || role === "ADMIN") {
          setCanModerate(true);
        }
      } catch {
        // Silently fail
      }
    }

    void checkCircleMembership();

    return () => {
      cancelled = true;
    };
  }, [post, sessionStatus, userId, isAdmin]);

  // Auth guard
  const requireAuth = useCallback((): boolean => {
    if (sessionStatus === "loading") return false;
    if (sessionStatus !== "authenticated") {
      const callbackUrl = pathname && pathname.length > 0 ? pathname : "/";
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return false;
    }
    return true;
  }, [sessionStatus, pathname, router]);

  // Like toggle (optimistic)
  async function handleLike() {
    if (likePending) return;
    if (!requireAuth()) return;

    const prevLiked = liked;
    const prevCount = likeCount;
    const nextLiked = !prevLiked;
    const nextCount = prevCount + (nextLiked ? 1 : -1);

    setLiked(nextLiked);
    setLikeCount(nextCount);
    setLikePending(true);

    try {
      const res = await fetch(`/api/posts/${postId}/like`, {
        method: nextLiked ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setLiked(prevLiked);
        setLikeCount(prevCount);
      }
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    } finally {
      setLikePending(false);
    }
  }

  // Bookmark toggle (optimistic)
  async function handleBookmark() {
    if (bookmarkPending) return;
    if (!requireAuth()) return;

    const prevBookmarked = bookmarked;
    const nextBookmarked = !prevBookmarked;

    setBookmarked(nextBookmarked);
    setBookmarkPending(true);

    try {
      const res = await fetch(`/api/posts/${postId}/bookmark`, {
        method: nextBookmarked ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setBookmarked(prevBookmarked);
      }
    } catch {
      setBookmarked(prevBookmarked);
    } finally {
      setBookmarkPending(false);
    }
  }

  // Pin toggle (admin/moderator)
  async function handlePin() {
    if (pinPending) return;

    const prevPinned = isPinned;
    setIsPinned(!prevPinned);
    setPinPending(true);

    try {
      const res = await fetch(`/api/posts/${postId}/pin`, { method: "POST" });
      const payload = (await res.json().catch(() => ({}))) as PinToggleResponse;

      if (!res.ok) {
        setIsPinned(prevPinned);
        toast.error(payload.error ?? "操作失败");
        return;
      }

      if (typeof payload.isPinned === "boolean") {
        setIsPinned(payload.isPinned);
      }
      toast.success(payload.isPinned ? "已置顶" : "已取消置顶");
    } catch {
      setIsPinned(prevPinned);
      toast.error("网络异常，操作失败");
    } finally {
      setPinPending(false);
    }
  }

  // Delete post
  async function handleDelete() {
    const ok = await confirm({
      title: "删除确认",
      message: "确定删除这篇帖子吗？删除后不可恢复。",
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    setDeletePending(true);

    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => ({}))) as DeleteResponse;

      if (!res.ok) {
        toast.error(payload.error ?? "删除失败");
        return;
      }

      toast.success("帖子已删除");
      // Navigate back
      if (circleSlug) {
        router.push(`/c/${circleSlug}`);
      } else {
        router.push("/");
      }
    } catch {
      toast.error("网络异常，删除失败");
    } finally {
      setDeletePending(false);
    }
  }

  // Copy share link
  function handleShare() {
    const url = window.location.href;
    void navigator.clipboard.writeText(url).then(() => {
      toast.success("链接已复制到剪贴板");
    });
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex justify-center">
          <LoadingSpinner size="lg" text="加载中..." />
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="m3-surface-soft px-6 py-12 text-center">
          <h2 className="text-lg font-semibold text-warm-800">
            {error ?? "帖子不存在"}
          </h2>
          <Link
            href={circleSlug ? `/c/${circleSlug}` : "/"}
            className="m3-btn m3-btn-primary mt-4 inline-flex"
          >
            返回
          </Link>
        </div>
      </div>
    );
  }

  const isAuthor = userId === post.authorId;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* ── Breadcrumb ── */}
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-warm-500">
        {circleSlug && post.circle ? (
          <>
            <Link
              href={`/c/${circleSlug}`}
              className="transition-colors hover:text-accent"
            >
              {post.circle.name}
            </Link>
            <span>/</span>
          </>
        ) : (
          <>
            <Link href="/" className="transition-colors hover:text-accent">
              广场
            </Link>
            <span>/</span>
          </>
        )}
        <span className="truncate text-warm-400">{post.title || "帖子详情"}</span>
      </nav>

      {/* ── Post card ── */}
      <article className="m3-surface p-4 sm:p-6">
        {/* ── Author info ── */}
        <div className="mb-4 flex items-center gap-3">
          <Link href={`/u/${post.author.uid}`}>
            <span className="relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
              <Image
                src={normalizeImageSrc(post.author.image) || "/default-avatar.png"}
                alt={post.author.name ?? "用户头像"}
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            </span>
          </Link>

          <div className="min-w-0">
            <Link
              href={`/u/${post.author.uid}`}
              className="text-sm font-medium text-warm-800 transition-colors hover:text-accent"
            >
              {post.author.name ?? `用户${post.author.uid}`}
            </Link>
            <p className="text-xs text-warm-400">
              {timeAgo(post.createdAt)}
              {post.section && (
                <span className="ml-2 rounded-full bg-warm-100 px-2 py-0.5 text-xs text-warm-500">
                  {post.section.name}
                </span>
              )}
            </p>
          </div>

          {isPinned && (
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
          <h1 className="mb-4 text-2xl font-bold tracking-tight text-warm-800">
            {post.title}
          </h1>
        )}

        {/* ── Content ── */}
        <div className="mb-6">
          <PostContentRenderer content={post.content} />
        </div>

        {/* ── Images ── */}
        {post.images && post.images.length > 0 && (
          <div className="mb-6 flex flex-col gap-2">
            {post.images.map((url, i) => (
              <a
                key={i}
                href={normalizeImageSrc(url) || url}
                target="_blank"
                rel="noopener noreferrer"
                className="overflow-hidden rounded-lg"
              >
                <Image
                  src={normalizeImageSrc(url) || url}
                  alt={`图片 ${i + 1}`}
                  width={800}
                  height={600}
                  className="w-full rounded-lg object-contain"
                  loading="lazy"
                  unoptimized
                />
              </a>
            ))}
          </div>
        )}

        {/* ── Stats ── */}
        <div className="mb-4 flex items-center gap-4 border-t border-warm-200 pt-4 text-sm text-warm-400">
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
        </div>

        {/* ── Action bar ── */}
        <div className="flex flex-wrap items-center gap-1 border-t border-warm-200 pt-3 sm:gap-3 sm:pt-4">
          {/* Like */}
          <button
            type="button"
            onClick={() => {
              void handleLike();
            }}
            disabled={likePending}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed ${
              liked
                ? "bg-accent-muted text-accent"
                : "text-warm-500 hover:bg-warm-100 hover:text-warm-700 active:bg-warm-100"
            }`}
            aria-label={liked ? "取消点赞" : "点赞"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill={liked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={liked ? 0 : 1.5}
              className="h-[18px] w-[18px]"
            >
              <path d="M2 10.5a1.5 1.5 0 1 1 3 0v6a1.5 1.5 0 0 1-3 0v-6ZM6 10.333v5.43a2 2 0 0 0 1.106 1.79l.05.025A4 4 0 0 0 8.943 18h5.416a2 2 0 0 0 1.962-1.608l1.2-6A2 2 0 0 0 15.56 8H12V4a2 2 0 0 0-2-2 1 1 0 0 0-1 1v.667a4 4 0 0 1-.8 2.4L6.8 7.933a4 4 0 0 0-.8 2.4Z" />
            </svg>
            <span className="tabular-nums">{likeCount}</span>
          </button>

          {/* Bookmark */}
          <button
            type="button"
            onClick={() => {
              void handleBookmark();
            }}
            disabled={bookmarkPending}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed ${
              bookmarked
                ? "bg-accent-muted text-accent"
                : "text-warm-500 hover:bg-warm-100 hover:text-warm-700 active:bg-warm-100"
            }`}
            aria-label={bookmarked ? "取消收藏" : "收藏"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill={bookmarked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={bookmarked ? 0 : 1.5}
              className="h-[18px] w-[18px]"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 3a2 2 0 0 0-2 2v12l7-4 7 4V5a2 2 0 0 0-2-2H5Z"
              />
            </svg>
            <span>{bookmarked ? "已收藏" : "收藏"}</span>
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-warm-500 transition-colors hover:bg-warm-100 hover:text-warm-700 active:bg-warm-100"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-[18px] w-[18px]"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6.5l3-3m0 0l-3-3m3 3H10a5 5 0 0 0-5 5v1m3 7.5l-3 3m0 0l3 3m-3-3H10a5 5 0 0 0 5-5v-1"
              />
            </svg>
            <span>分享</span>
          </button>

          {/* ── Admin / Moderator actions ── */}
          {canModerate && (
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              {/* Pin / Unpin */}
              <button
                type="button"
                onClick={() => {
                  void handlePin();
                }}
                disabled={pinPending}
                className="m3-btn m3-btn-tonal text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPinned ? "取消置顶" : "置顶"}
              </button>

              {/* Delete */}
              {(isAuthor || canModerate) && (
                <button
                  type="button"
                  onClick={() => {
                    void handleDelete();
                  }}
                  disabled={deletePending}
                  className="m3-btn text-xs text-accent-hover transition-colors hover:bg-accent-hover/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletePending ? "删除中..." : "删除"}
                </button>
              )}
            </div>
          )}

          {/* Author can delete even without moderation */}
          {isAuthor && !canModerate && (
            <div className="ml-auto">
              <button
                type="button"
                onClick={() => {
                  void handleDelete();
                }}
                disabled={deletePending}
                className="m3-btn text-xs text-accent-hover transition-colors hover:bg-accent-hover/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletePending ? "删除中..." : "删除"}
              </button>
            </div>
          )}
        </div>
      </article>

      {/* ── Comment section ── */}
      <ForumCommentSection
        postId={postId}
        initialComments={comments}
        initialNextCursor={commentNextCursor}
        canComment={canComment}
        canModerate={canModerate}
        currentUserId={userId}
      />
    </div>
  );
}
