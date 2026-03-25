"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  if (typeof payload !== "object" || payload === null) return undefined;
  const maybeError = (payload as { error?: unknown }).error;
  return typeof maybeError === "string" ? maybeError : undefined;
}

/** Build 2-level comment tree: roots + replies grouped under root ancestor */
function buildCommentTree(comments: ForumComment[]) {
  const map = new Map<string, ForumComment>();
  for (const c of comments) map.set(c.id, c);

  const roots: ForumComment[] = [];
  const repliesMap = new Map<string, ForumComment[]>();

  function findRootId(c: ForumComment): string | null {
    if (!c.parentCommentId) return null;
    const visited = new Set<string>();
    let cur = c;
    while (cur.parentCommentId) {
      if (visited.has(cur.id)) break;
      visited.add(cur.id);
      const parent = map.get(cur.parentCommentId);
      if (!parent) return cur.parentCommentId;
      if (!parent.parentCommentId) return parent.id;
      cur = parent;
    }
    return cur.id;
  }

  for (const c of comments) {
    if (!c.parentCommentId) {
      roots.push(c);
    } else {
      const rootId = findRootId(c);
      if (rootId && map.has(rootId)) {
        if (!repliesMap.has(rootId)) repliesMap.set(rootId, []);
        repliesMap.get(rootId)!.push(c);
      } else {
        roots.push(c);
      }
    }
  }

  for (const replies of repliesMap.values()) {
    replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  return { roots, repliesMap };
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

  useEffect(() => {
    if (initialComments && initialComments.length > 0) setComments(initialComments);
  }, [initialComments]);

  useEffect(() => {
    if (initialNextCursor !== undefined) setNextCursor(initialNextCursor ?? null);
  }, [initialNextCursor]);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { roots, repliesMap } = useMemo(() => buildCommentTree(comments), [comments]);
  const commentCount = comments.length;

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/posts/${postId}/comments?cursor=${encodeURIComponent(nextCursor)}`,
      );
      const payload = (await response.json().catch(() => ({}))) as ForumCommentResponse;
      if (!response.ok) throw new Error(extractError(payload) ?? "评论加载失败");
      const nextComments = Array.isArray(payload.comments) ? payload.comments : [];
      setComments((prev) => [...prev, ...nextComments]);
      setNextCursor(payload.nextCursor ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "评论加载失败");
    } finally {
      setIsLoadingMore(false);
    }
  }, [postId, nextCursor, isLoadingMore, toast]);

  const handleSubmitComment = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("评论内容不能为空");
      return;
    }
    if (trimmed.length > 2000) {
      toast.error("评论最多 2000 字");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const payload = (await response.json().catch(() => ({}))) as CreateCommentResponse;
      if (!response.ok || !payload.data) {
        toast.error(payload.error ?? "发表评论失败，请稍后重试");
        return;
      }
      setComments((prev) => [payload.data as ForumComment, ...prev]);
      setContent("");
      toast.success("评论发表成功");
    } catch {
      toast.error("网络异常，发表评论失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitReply = useCallback(
    async (parentCommentId: string, replyContent: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/posts/${postId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: replyContent, parentCommentId }),
        });
        const payload = (await response.json().catch(() => ({}))) as CreateCommentResponse;
        if (!response.ok || !payload.data) {
          toast.error(payload.error ?? "回复失败，请稍后重试");
          return false;
        }
        setComments((prev) => [...prev, payload.data as ForumComment]);
        toast.success("回复成功");
        return true;
      } catch {
        toast.error("网络异常，回复失败");
        return false;
      }
    },
    [postId, toast],
  );

  const handleDeleted = (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const handleLikeChange = (commentId: string, liked: boolean, likeCount: number) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, isLiked: liked, likeCount } : c)),
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
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="写下你的评论..."
            className="m3-input w-full"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-warm-500">{content.length}/2000</span>
            <button
              type="button"
              onClick={() => void handleSubmitComment()}
              disabled={isSubmitting}
              className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "发表中..." : "发表"}
            </button>
          </div>
        </div>
      ) : status !== "authenticated" ? (
        <div className="m3-surface-soft px-4 py-3 text-sm text-warm-600">登录后参与评论</div>
      ) : null}

      <div className="mt-6">
        {roots.length === 0 ? (
          <EmptyState title="暂无评论" description="来发表第一条评论吧" />
        ) : (
          <>
            {roots.map((comment) => (
              <ForumCommentItem
                key={comment.id}
                comment={comment}
                postId={postId}
                canModerate={canModerate}
                canComment={canComment}
                currentUserId={currentUserId}
                replies={repliesMap.get(comment.id)}
                onSubmitReply={handleSubmitReply}
                onDeleted={handleDeleted}
                onLikeChange={handleLikeChange}
              />
            ))}
            {nextCursor && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
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
