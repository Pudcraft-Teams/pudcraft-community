"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { ReportDialog } from "@/components/ReportDialog";
import { UserAvatar } from "@/components/UserAvatar";
import { useToast } from "@/hooks/useToast";
import { timeAgo } from "@/lib/time";
import type { ForumComment } from "@/lib/types";

interface ForumCommentItemProps {
  comment: ForumComment;
  postId: string;
  canModerate: boolean;
  canComment: boolean;
  currentUserId?: string;
  isReply?: boolean;
  rootCommentId?: string;
  replies?: ForumComment[];
  onSubmitReply: (parentCommentId: string, content: string) => Promise<boolean>;
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
  canComment,
  currentUserId,
  isReply = false,
  rootCommentId,
  replies = [],
  onSubmitReply,
  onDeleted,
  onLikeChange,
}: ForumCommentItemProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [optimisticLiked, setOptimisticLiked] = useState(comment.isLiked ?? false);
  const [optimisticLikeCount, setOptimisticLikeCount] = useState(comment.likeCount);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  const canDelete = currentUserId === comment.authorId || canModerate;
  const showParentAttribution =
    isReply && rootCommentId && comment.parentCommentId !== rootCommentId && comment.parentAuthor;

  useEffect(() => {
    if (showReplyBox) {
      const timer = setTimeout(() => replyInputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [showReplyBox]);

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
    if (!ok) return;

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

  const handleSubmitInlineReply = async () => {
    const trimmed = replyContent.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) {
      toast.error("评论最多 2000 字");
      return;
    }

    setIsSubmittingReply(true);
    try {
      const success = await onSubmitReply(comment.id, trimmed);
      if (success) {
        setReplyContent("");
        setShowReplyBox(false);
      }
    } finally {
      setIsSubmittingReply(false);
    }
  };

  return (
    <div id={`forum-comment-${comment.id}`} className={isReply ? "" : "border-b border-warm-200 py-4"}>
      <div className={isReply ? "py-2.5" : ""}>
        {/* Header */}
        <div className="flex items-center gap-2">
          <UserAvatar
            src={comment.author.image}
            name={comment.author.name}
            className={isReply ? "h-6 w-6" : "h-7 w-7"}
            fallbackClassName="bg-gradient-to-br from-accent to-accent-hover text-white"
          />
          <Link
            href={`/u/${comment.author.uid}`}
            className={`m3-link font-medium ${isReply ? "text-xs" : "text-sm"}`}
          >
            {displayAuthorName(comment.author)}
          </Link>
          {showParentAttribution && comment.parentAuthor && (
            <>
              <svg className="h-3 w-3 flex-shrink-0 text-warm-300" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs text-warm-400">@{displayAuthorName(comment.parentAuthor)}</span>
            </>
          )}
          <span className="text-xs text-warm-300">&middot;</span>
          <span className="text-xs text-warm-400">{timeAgo(comment.createdAt)}</span>
        </div>

        {/* Content */}
        <p
          className={`whitespace-pre-wrap break-words leading-relaxed text-warm-700 ${
            isReply ? "ml-8 mt-1 text-[13px]" : "mt-2 text-sm"
          }`}
        >
          {comment.content}
        </p>

        {/* Actions */}
        <div className={`mt-1.5 flex items-center gap-1 ${isReply ? "ml-8" : ""}`}>
          {/* Like */}
          <button
            type="button"
            onClick={() => void handleLikeToggle()}
            disabled={isLiking}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
              optimisticLiked ? "text-rose-500" : "text-warm-400 hover:bg-warm-50 hover:text-warm-500"
            } disabled:cursor-not-allowed`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill={optimisticLiked ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={optimisticLiked ? 0 : 1.5}
              className="h-3.5 w-3.5"
            >
              <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.765-2.033C4.06 12.724 2.5 10.9 2.5 8.5A3.5 3.5 0 016 5c1.277 0 2.392.683 3.005 1.704A3.497 3.497 0 0112 5a3.5 3.5 0 013.5 3.5c0 2.4-1.56 4.224-3.202 5.687a22.043 22.043 0 01-2.765 2.033 20.759 20.759 0 01-1.162.682l-.019.01-.005.003h-.002a.5.5 0 01-.49 0z" />
            </svg>
            {optimisticLikeCount > 0 && <span>{optimisticLikeCount}</span>}
          </button>

          {/* Reply */}
          {canComment && currentUserId && (
            <button
              type="button"
              onClick={() => setShowReplyBox((v) => !v)}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
                showReplyBox
                  ? "bg-teal-50 text-teal-600"
                  : "text-warm-400 hover:bg-warm-50 hover:text-teal-600"
              }`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z"
                  clipRule="evenodd"
                />
              </svg>
              回复
            </button>
          )}

          {/* Delete */}
          {canDelete && (
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => void handleDelete()}
              className="rounded-full px-2 py-0.5 text-xs text-warm-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? "删除中..." : "删除"}
            </button>
          )}

          {/* Report */}
          {currentUserId && currentUserId !== comment.authorId && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="rounded-full px-2 py-0.5 text-xs text-warm-400 transition-colors hover:bg-warm-50 hover:text-warm-500"
            >
              举报
            </button>
          )}
        </div>

        {/* Inline reply box — animated via grid-template-rows */}
        <div
          className={`grid transition-all duration-200 ease-out ${
            showReplyBox ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          } ${isReply ? "ml-8" : ""}`}
        >
          <div className="overflow-hidden">
            <div className="pt-2">
              <div className="rounded-lg border border-warm-200 bg-warm-50/50 p-2">
                <textarea
                  ref={replyInputRef}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder={`回复 @${displayAuthorName(comment.author)}...`}
                  className="w-full resize-none bg-transparent text-sm text-warm-700 placeholder:text-warm-400 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void handleSubmitInlineReply();
                    }
                  }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-warm-300">{replyContent.length}/2000</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowReplyBox(false);
                        setReplyContent("");
                      }}
                      className="text-xs text-warm-400 transition-colors hover:text-warm-600"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingReply || !replyContent.trim()}
                      onClick={() => void handleSubmitInlineReply()}
                      className="rounded-full bg-teal-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSubmittingReply ? "发送中..." : "发送"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reply thread */}
      {!isReply && replies.length > 0 && (
        <div className="ml-5 border-l-2 border-warm-100 pl-4">
          {replies.map((reply) => (
            <ForumCommentItem
              key={reply.id}
              comment={reply}
              postId={postId}
              canModerate={canModerate}
              canComment={canComment}
              currentUserId={currentUserId}
              isReply
              rootCommentId={comment.id}
              onSubmitReply={onSubmitReply}
              onDeleted={onDeleted}
              onLikeChange={onLikeChange}
            />
          ))}
        </div>
      )}

      <ReportDialog
        targetType="forum_comment"
        targetId={comment.id}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}
