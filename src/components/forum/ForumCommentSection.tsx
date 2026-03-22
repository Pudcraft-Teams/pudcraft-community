"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { ForumCommentItem } from "@/components/forum/ForumCommentItem";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/hooks/useToast";
import type { ForumComment, ForumCommentResponse } from "@/lib/types";

interface ForumCommentSectionProps {
  postId: string;
  initialComments?: ForumComment[];
  initialNextCursor?: string | null;
  canComment: boolean;
  canModerate: boolean;
  currentUserId?: string;
}

interface CreateCommentResponse {
  data?: ForumComment;
  error?: string;
}

function extractError(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const maybeError = (payload as { error?: unknown }).error;
  return typeof maybeError === "string" ? maybeError : undefined;
}

export function ForumCommentSection({
  postId,
  initialComments,
  initialNextCursor,
  canComment,
  canModerate,
  currentUserId,
}: ForumCommentSectionProps) {
  const { status } = useSession();
  const { toast } = useToast();

  const [comments, setComments] = useState<ForumComment[]>(initialComments ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor ?? null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{
    commentId: string;
    authorName: string;
  } | null>(null);

  const commentCount = comments.length;

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);

    try {
      const response = await fetch(
        `/api/posts/${postId}/comments?cursor=${encodeURIComponent(nextCursor)}`,
      );
      const payload = (await response.json().catch(() => ({}))) as ForumCommentResponse;

      if (!response.ok) {
        throw new Error(extractError(payload) ?? "评论加载失败");
      }

      const nextComments = Array.isArray(payload.comments) ? payload.comments : [];
      setComments((prev) => [...prev, ...nextComments]);
      setNextCursor(payload.nextCursor ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "评论加载失败";
      toast.error(message);
    } finally {
      setIsLoadingMore(false);
    }
  }, [postId, nextCursor, isLoadingMore, toast]);

  const handleSubmitComment = async () => {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      toast.error("评论内容不能为空");
      return;
    }
    if (trimmed.length > 2000) {
      toast.error("评论最多 2000 字");
      return;
    }

    setIsSubmitting(true);

    try {
      const body: Record<string, string> = { content: trimmed };
      if (replyTarget) {
        body.parentCommentId = replyTarget.commentId;
      }

      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as CreateCommentResponse;

      if (!response.ok || !payload.data) {
        toast.error(payload.error ?? "发表评论失败，请稍后重试");
        return;
      }

      setComments((prev) => [payload.data as ForumComment, ...prev]);
      setContent("");
      setReplyTarget(null);
      toast.success("评论发表成功");
    } catch {
      toast.error("网络异常，发表评论失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReply = (commentId: string, authorName: string) => {
    setReplyTarget({ commentId, authorName });
  };

  const handleCancelReply = () => {
    setReplyTarget(null);
  };

  const handleDeleted = (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const handleLikeChange = (commentId: string, liked: boolean, likeCount: number) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId ? { ...c, isLiked: liked, likeCount } : c,
      ),
    );
  };

  return (
    <section className="mt-8 border-t border-warm-200 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-warm-800">评论区</h2>
        <span className="text-sm text-warm-500">{commentCount} 条评论</span>
      </div>

      {canComment && status === "authenticated" ? (
        <div className="m3-surface p-4">
          {replyTarget && (
            <div className="mb-2 flex items-center gap-2 text-sm text-warm-500">
              <span>
                回复 <span className="font-medium text-warm-700">@{replyTarget.authorName}</span>
              </span>
              <button
                type="button"
                onClick={handleCancelReply}
                className="rounded px-1.5 py-0.5 text-xs text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-600"
              >
                取消
              </button>
            </div>
          )}
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={replyTarget ? `回复 @${replyTarget.authorName}...` : "写下你的评论..."}
            className="m3-input w-full"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">{content.length}/2000</span>
            <button
              type="button"
              onClick={() => {
                void handleSubmitComment();
              }}
              disabled={isSubmitting}
              className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "发表中..." : "发表"}
            </button>
          </div>
        </div>
      ) : status !== "authenticated" ? (
        <div className="m3-surface-soft px-4 py-3 text-sm text-warm-600">
          登录后参与评论
        </div>
      ) : null}

      <div className="mt-6">
        {comments.length === 0 ? (
          <EmptyState title="暂无评论" description="来发表第一条评论吧" />
        ) : (
          <>
            {comments.map((comment) => (
              <ForumCommentItem
                key={comment.id}
                comment={comment}
                postId={postId}
                canModerate={canModerate}
                currentUserId={currentUserId}
                onReply={handleReply}
                onDeleted={handleDeleted}
                onLikeChange={handleLikeChange}
              />
            ))}

            {nextCursor && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    void loadMore();
                  }}
                  disabled={isLoadingMore}
                  className="m3-btn m3-btn-tonal disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingMore ? "加载中..." : "加载更多"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
