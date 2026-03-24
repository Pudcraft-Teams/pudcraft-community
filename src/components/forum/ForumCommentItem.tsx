"use client";

import Link from "next/link";
import { useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { UserAvatar } from "@/components/UserAvatar";
import { useToast } from "@/hooks/useToast";
import { timeAgo } from "@/lib/time";
import type { ForumComment } from "@/lib/types";

interface ForumCommentItemProps {
  comment: ForumComment;
  postId: string;
  canModerate: boolean;
  currentUserId?: string;
  onReply: (commentId: string, authorName: string) => void;
  onDeleted: (commentId: string) => void;
  onLikeChange: (commentId: string, liked: boolean, likeCount: number) => void;
}

interface DeleteCommentResponse {
  error?: string;
}

interface LikeResponse {
  liked?: boolean;
  likeCount?: number;
  error?: string;
}

function displayAuthorName(author: Pick<ForumComment["author"], "name">): string {
  if (author.name && author.name.trim().length > 0) {
    return author.name.trim();
  }
  return "匿名用户";
}

export function ForumCommentItem({
  comment,
  postId,
  canModerate,
  currentUserId,
  onReply,
  onDeleted,
  onLikeChange,
}: ForumCommentItemProps) {
  void postId; // reserved for future use (e.g. anchoring)

  const { toast } = useToast();
  const confirm = useConfirm();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [optimisticLiked, setOptimisticLiked] = useState(comment.isLiked ?? false);
  const [optimisticLikeCount, setOptimisticLikeCount] = useState(comment.likeCount);

  const canDelete = currentUserId === comment.authorId || canModerate;

  const handleLikeToggle = async () => {
    if (!currentUserId) {
      toast.error("请先登录");
      return;
    }
    if (isLiking) return;

    const prevLiked = optimisticLiked;
    const prevCount = optimisticLikeCount;
    const nextLiked = !prevLiked;
    const nextCount = nextLiked ? prevCount + 1 : Math.max(0, prevCount - 1);

    setOptimisticLiked(nextLiked);
    setOptimisticLikeCount(nextCount);
    setIsLiking(true);

    try {
      const response = await fetch(`/api/comments/${comment.id}/like`, {
        method: nextLiked ? "POST" : "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as LikeResponse;

      if (!response.ok) {
        setOptimisticLiked(prevLiked);
        setOptimisticLikeCount(prevCount);
        toast.error(payload.error ?? "操作失败");
        return;
      }

      const serverLiked = payload.liked ?? nextLiked;
      const serverCount = typeof payload.likeCount === "number" ? payload.likeCount : nextCount;
      setOptimisticLiked(serverLiked);
      setOptimisticLikeCount(serverCount);
      onLikeChange(comment.id, serverLiked, serverCount);
    } catch {
      setOptimisticLiked(prevLiked);
      setOptimisticLikeCount(prevCount);
      toast.error("网络异常，操作失败");
    } finally {
      setIsLiking(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "删除确认",
      message: "确定删除这条评论吗？",
      confirmText: "删除",
      danger: true,
    });
    if (!ok) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/comments/${comment.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as DeleteCommentResponse;

      if (!response.ok) {
        toast.error(payload.error ?? "删除失败，请稍后重试");
        return;
      }

      onDeleted(comment.id);
      toast.success("删除成功");
    } catch {
      toast.error("网络异常，删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div id={`forum-comment-${comment.id}`} className="border-b border-warm-200 py-4">
      <div className="flex items-center gap-2">
        <UserAvatar
          src={comment.author.image}
          name={comment.author.name}
          className="h-7 w-7"
          fallbackClassName="bg-gradient-to-br from-accent to-accent-hover text-white"
        />
        <Link href={`/u/${comment.author.uid}`} className="m3-link text-sm font-medium">
          {displayAuthorName(comment.author)}
        </Link>
        <span className="text-xs text-warm-400">·</span>
        <span className="text-xs text-warm-500">{timeAgo(comment.createdAt)}</span>
      </div>

      {comment.parentCommentId && comment.parentAuthor && (
        <p className="mt-1 text-xs text-warm-400">
          回复{" "}
          <span className="text-warm-500">
            @{displayAuthorName(comment.parentAuthor)}
          </span>
        </p>
      )}

      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-warm-700">
        {comment.content}
      </p>

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={() => {
            void handleLikeToggle();
          }}
          disabled={isLiking}
          className={`flex items-center gap-1 text-sm transition-colors ${
            optimisticLiked
              ? "text-accent"
              : "text-warm-500 hover:text-warm-700"
          } disabled:cursor-not-allowed`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill={optimisticLiked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={optimisticLiked ? 0 : 1.5}
            className="h-4 w-4"
          >
            <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.765-2.033C4.06 12.724 2.5 10.9 2.5 8.5A3.5 3.5 0 016 5c1.277 0 2.392.683 3.005 1.704A3.497 3.497 0 0112 5a3.5 3.5 0 013.5 3.5c0 2.4-1.56 4.224-3.202 5.687a22.043 22.043 0 01-2.765 2.033 20.759 20.759 0 01-1.162.682l-.019.01-.005.003h-.002a.5.5 0 01-.49 0z" />
          </svg>
          {optimisticLikeCount > 0 && (
            <span className="text-xs">{optimisticLikeCount}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onReply(comment.id, displayAuthorName(comment.author))}
          className="text-sm text-warm-500 transition-colors hover:text-warm-700"
        >
          回复
        </button>

        {canDelete && (
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => {
              void handleDelete();
            }}
            className="text-sm text-warm-500 transition-colors hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? "删除中..." : "删除"}
          </button>
        )}
      </div>
    </div>
  );
}
