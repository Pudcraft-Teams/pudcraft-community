"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { CommentItem } from "@/components/CommentItem";
import { EmptyState } from "@/components/EmptyState";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/hooks/useToast";
import type {
  CommentAuthor,
  CommentReply,
  ServerComment,
  ServerCommentsResponse,
} from "@/lib/types";

interface CreateCommentResponse {
  data?: {
    id: string;
    content: string;
    createdAt: string;
    parentId: string | null;
    author: CommentAuthor;
  };
  error?: string;
}

interface CommentSectionProps {
  serverId: string;
  initialComments?: ServerComment[];
  initialTotal?: number;
  initialPage?: number;
  initialTotalPages?: number;
}

const COMMENTS_PAGE_SIZE = 20;

function extractError(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const maybeError = (payload as { error?: unknown }).error;
  return typeof maybeError === "string" ? maybeError : undefined;
}

export function CommentSection({
  serverId,
  initialComments,
  initialTotal,
  initialPage = 1,
  initialTotalPages = 1,
}: CommentSectionProps) {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const currentUserId = session?.user?.id;
  const hasInitialPayload = Array.isArray(initialComments) && typeof initialTotal === "number";

  const [comments, setComments] = useState<ServerComment[]>(initialComments ?? []);
  const [total, setTotal] = useState(initialTotal ?? 0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(Math.max(1, initialTotalPages));
  const [isLoading, setIsLoading] = useState(!hasInitialPayload);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeReplyCommentId, setActiveReplyCommentId] = useState<string | null>(null);

  const loadComments = useCallback(
    async (targetPage: number, append: boolean) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setLoadError(null);
      }

      try {
        const response = await fetch(
          `/api/servers/${serverId}/comments?page=${targetPage}&limit=${COMMENTS_PAGE_SIZE}`,
        );
        const payload = (await response.json().catch(() => ({}))) as ServerCommentsResponse;
        if (!response.ok) {
          throw new Error(extractError(payload) ?? "评论加载失败");
        }

        const nextComments = Array.isArray(payload.comments) ? payload.comments : [];
        const nextTotal = typeof payload.total === "number" ? payload.total : 0;
        const nextPage = typeof payload.page === "number" ? payload.page : targetPage;
        const nextTotalPages =
          typeof payload.totalPages === "number" ? Math.max(1, payload.totalPages) : 1;

        setComments((prev) => (append ? [...prev, ...nextComments] : nextComments));
        setTotal(nextTotal);
        setCurrentPage(nextPage);
        setTotalPages(nextTotalPages);
      } catch (error) {
        const message = error instanceof Error ? error.message : "评论加载失败";
        if (append) {
          toast.error(message);
        } else {
          setLoadError(message);
        }
      } finally {
        if (append) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [serverId, toast],
  );

  useEffect(() => {
    setActiveReplyCommentId(null);
    setLoadError(null);

    if (hasInitialPayload && initialComments && typeof initialTotal === "number") {
      setComments(initialComments);
      setTotal(initialTotal);
      setCurrentPage(initialPage);
      setTotalPages(Math.max(1, initialTotalPages));
      setIsLoading(false);
      return;
    }

    setComments([]);
    setTotal(0);
    setCurrentPage(1);
    setTotalPages(1);
    void loadComments(1, false);
  }, [
    hasInitialPayload,
    initialComments,
    initialPage,
    initialTotal,
    initialTotalPages,
    loadComments,
    serverId,
  ]);

  const handleSubmitComment = async () => {
    const nextContent = content.trim();
    if (nextContent.length === 0) {
      toast.error("评论内容不能为空");
      return;
    }
    if (nextContent.length > 1000) {
      toast.error("评论最多 1000 字");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/servers/${serverId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: nextContent }),
      });
      const payload = (await response.json().catch(() => ({}))) as CreateCommentResponse;

      if (!response.ok || !payload.data) {
        toast.error(payload.error ?? "发表评论失败，请稍后重试");
        return;
      }

      const newComment: ServerComment = {
        id: payload.data.id,
        content: payload.data.content,
        createdAt: payload.data.createdAt,
        author: payload.data.author,
        replies: [],
      };

      setComments((prev) => [newComment, ...prev]);
      setTotal((prev) => prev + 1);
      setContent("");
      toast.success("评论发表成功");
    } catch {
      toast.error("网络异常，发表评论失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReplyCreated = (parentId: string, reply: CommentReply) => {
    setComments((prev) =>
      prev.map((item) =>
        item.id === parentId
          ? {
              ...item,
              replies: [...item.replies, reply],
            }
          : item,
      ),
    );
  };

  const handleDeleted = (commentId: string, parentId: string | null) => {
    if (parentId === null) {
      setComments((prev) => prev.filter((item) => item.id !== commentId));
      if (activeReplyCommentId === commentId) {
        setActiveReplyCommentId(null);
      }
      setTotal((prev) => Math.max(0, prev - 1));
    } else {
      setComments((prev) =>
        prev.map((item) =>
          item.id === parentId
            ? {
                ...item,
                replies: item.replies.filter((reply) => reply.id !== commentId),
              }
            : item,
        ),
      );
    }
  };

  return (
    <section className="mt-8 border-t border-slate-200 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">评论区</h2>
        <span className="text-sm text-slate-500">{total} 条评论</span>
      </div>

      {status === "authenticated" ? (
        <div className="m3-surface p-4">
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="写下你对这个服务器的评价..."
            className="m3-input w-full"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">{content.length}/1000</span>
            <button
              type="button"
              onClick={handleSubmitComment}
              disabled={isSubmitting}
              className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "发表中..." : "发表"}
            </button>
          </div>
        </div>
      ) : (
        <div className="m3-surface-soft px-4 py-3 text-sm text-slate-600">
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/servers/${serverId}`)}`}
            className="m3-link"
          >
            登录后发表评论
          </Link>
        </div>
      )}

      <div className="mt-6">
        {isLoading ? (
          <LoadingSpinner text="评论加载中..." />
        ) : loadError ? (
          <div className="m3-alert-error">{loadError}</div>
        ) : comments.length === 0 ? (
          <EmptyState title="暂无评论" description="来发表第一条评论吧" />
        ) : (
          <>
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                serverId={serverId}
                currentUserId={currentUserId}
                isReplyOpen={activeReplyCommentId === comment.id}
                onToggleReply={() => {
                  setActiveReplyCommentId((prev) => (prev === comment.id ? null : comment.id));
                }}
                onReplyCreated={handleReplyCreated}
                onDeleted={handleDeleted}
              />
            ))}

            {currentPage < totalPages && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    void loadComments(currentPage + 1, true);
                  }}
                  disabled={isLoadingMore}
                  className="m3-btn m3-btn-tonal disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingMore ? "加载中..." : "加载更多评论"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
