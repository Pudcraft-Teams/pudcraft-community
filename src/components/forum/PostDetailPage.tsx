"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useConfirm } from "@/components/ConfirmDialog";
import { ReportDialog } from "@/components/ReportDialog";
import { PostContentRenderer } from "@/components/forum/PostContentRenderer";
import { buildPostDetailState } from "@/lib/forum-ui-state";
import { normalizeImageSrc } from "@/lib/image-url";
import { ForumCommentSection } from "@/components/forum/ForumCommentSection";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/hooks/useToast";
import { timeAgo } from "@/lib/time";

import type { PostDetail, ForumComment, ForumCommentResponse } from "@/lib/types";

interface PostDetailPageProps {
  postId: string;
  circleSlug?: string;
  initialPost?: PostDetail;
  initialComments?: ForumComment[];
  initialNextCursor?: string | null;
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


export function PostDetailPage({
  postId,
  circleSlug,
  initialPost,
  initialComments,
  initialNextCursor = null,
}: PostDetailPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const initialState = buildPostDetailState({
    initialPost,
    initialComments,
    initialNextCursor,
  });

  const [post, setPost] = useState<PostDetail | null>(initialState.post);
  const [isLoading, setIsLoading] = useState(initialState.isLoading);
  const [error, setError] = useState<string | null>(null);

  // Like/bookmark/pin local state
  const [liked, setLiked] = useState(initialState.liked);
  const [likeCount, setLikeCount] = useState(initialState.likeCount);
  const [likePending, setLikePending] = useState(false);
  const [bookmarked, setBookmarked] = useState(initialState.bookmarked);
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [isPinned, setIsPinned] = useState(initialState.isPinned);
  const [pinPending, setPinPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  // Comments state
  const [comments, setComments] = useState<ForumComment[]>(initialState.comments);
  const [commentNextCursor, setCommentNextCursor] = useState<string | null>(initialState.commentNextCursor);

  // Moderation state
  const [canModerate, setCanModerate] = useState(false);
  const [canPin, setCanPin] = useState(false);
  const [canComment, setCanComment] = useState(false);

  // Report state
  const [reportOpen, setReportOpen] = useState(false);

  const userId = session?.user?.id;
  const isAdmin = session?.user?.role === "admin";

  // Fetch post detail
  useEffect(() => {
    if (initialPost) {
      const nextState = buildPostDetailState({
        initialPost,
        initialComments,
        initialNextCursor,
      });
      setPost(nextState.post);
      setLiked(nextState.liked);
      setLikeCount(nextState.likeCount);
      setBookmarked(nextState.bookmarked);
      setIsPinned(nextState.isPinned);
      setIsLoading(false);
      setError(null);
      return;
    }

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
  }, [initialComments, initialNextCursor, initialPost, postId]);

  // Fetch initial comments
  useEffect(() => {
    if (initialComments) {
      setComments(initialComments);
      setCommentNextCursor(initialNextCursor);
      return;
    }

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
  }, [initialComments, initialNextCursor, postId]);

  // Determine moderation & comment permissions
  useEffect(() => {
    setCanModerate(false);
    setCanPin(false);
    setCanComment(false);

    if (!post) return;

    // 网站 admin 可以删除任何帖子，但不能置顶圈子帖子
    if (isAdmin) {
      setCanModerate(true);
      // 广场帖子：网站 admin 可置顶；圈子帖子：需圈子管理权限
      if (!post.circleId) {
        setCanPin(true);
      }
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
          setCanPin(true);
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
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("当前环境不支持自动复制，请手动复制地址");
      return;
    }

    const url = window.location.href;
    void navigator.clipboard.writeText(url)
      .then(() => {
        toast.success("链接已复制到剪贴板");
      })
      .catch(() => {
        toast.error("复制链接失败，请手动复制地址");
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
        <div className="mb-4 flex flex-wrap items-start gap-3">
          <Link href={`/u/${post.author.uid}`} className="shrink-0">
            <span className="relative inline-flex h-10 w-10 overflow-hidden rounded-full">
              <Image
                src={normalizeImageSrc(post.author.image) || "/default-avatar.png"}
                alt={post.author.name ?? "用户头像"}
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            </span>
          </Link>

          <div className="min-w-0 flex-1">
            <Link
              href={`/u/${post.author.uid}`}
              className="text-sm font-medium text-warm-800 transition-colors hover:text-accent"
            >
              {post.author.name ?? `用户${post.author.uid}`}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-warm-400">
              <span suppressHydrationWarning>{timeAgo(post.createdAt)}</span>
              {post.section && (
                <span className="rounded-full bg-warm-100 px-2 py-0.5 text-xs text-warm-500">
                  {post.section.name}
                </span>
              )}
            </div>
          </div>

          {isPinned && (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent-muted px-2.5 py-1 text-xs text-accent sm:ml-auto">
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
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-warm-200 pt-4 text-sm text-warm-400">
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
        <div className="border-t border-warm-200 pt-3 sm:hidden">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                void handleLike();
              }}
              disabled={likePending}
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed ${
                liked
                  ? "bg-accent-muted text-accent"
                  : "bg-warm-50 text-warm-600 active:bg-warm-100"
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

            <button
              type="button"
              onClick={() => {
                void handleBookmark();
              }}
              disabled={bookmarkPending}
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed ${
                bookmarked
                  ? "bg-accent-muted text-accent"
                  : "bg-warm-50 text-warm-600 active:bg-warm-100"
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

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-warm-50 px-3 py-2 text-sm text-warm-600 active:bg-warm-100"
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

            {!isAuthor && sessionStatus === "authenticated" ? (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-warm-50 px-3 py-2 text-sm text-warm-600 active:bg-warm-100"
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
                    d="M3 3v14m0-14l9 2v8l-9 2M12 5l5-1v8l-5 1"
                  />
                </svg>
                <span>举报</span>
              </button>
            ) : (
              <div />
            )}
          </div>

          {(canModerate || canPin || (isAuthor && !canModerate)) && (
            <div className="mt-3 grid gap-2">
              {(canModerate || canPin) && (
                <div className="grid grid-cols-2 gap-2">
                  {canPin ? (
                    <button
                      type="button"
                      onClick={() => {
                        void handlePin();
                      }}
                      disabled={pinPending}
                      className="m3-btn m3-btn-tonal min-h-11 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPinned ? "取消置顶" : "置顶"}
                    </button>
                  ) : (
                    <div />
                  )}
                  {canModerate && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleDelete();
                      }}
                      disabled={deletePending}
                      className="m3-btn min-h-11 text-sm text-accent-hover transition-colors hover:bg-accent-hover/10 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletePending ? "删除中..." : "删除"}
                    </button>
                  )}
                </div>
              )}

              {isAuthor && !canModerate && (
                <button
                  type="button"
                  onClick={() => {
                    void handleDelete();
                  }}
                  disabled={deletePending}
                  className="m3-btn min-h-11 w-full text-sm text-accent-hover transition-colors hover:bg-accent-hover/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletePending ? "删除中..." : "删除"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="hidden flex-wrap items-center gap-3 border-t border-warm-200 pt-4 sm:flex">
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

          {/* Report (non-author only) */}
          {!isAuthor && sessionStatus === "authenticated" && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
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
                  d="M3 3v14m0-14l9 2v8l-9 2M12 5l5-1v8l-5 1"
                />
              </svg>
              <span>举报</span>
            </button>
          )}

          {/* ── Admin / Moderator actions ── */}
          {(canModerate || canPin) && (
            <div className="ml-auto flex items-center gap-2">
              {/* Pin / Unpin (圈子帖子仅圈子管理可操作) */}
              {canPin && (
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
              )}

              {/* Delete */}
              {canModerate && (
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

      {/* ── Report dialog ── */}
      <ReportDialog
        targetType="post"
        targetId={postId}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}
