"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
import { UserAvatar } from "@/components/UserAvatar";
import { useToast } from "@/hooks/useToast";
import { timeAgo } from "@/lib/time";
import type { CommentAuthor, CommentReply, ServerComment } from "@/lib/types";

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

interface DeleteCommentResponse {
  error?: string;
}

interface CommentItemProps {
  comment: ServerComment;
  serverId: string;
  currentUserId?: string;
  isReplyOpen: boolean;
  onToggleReply: () => void;
  onReplyCreated: (parentId: string, reply: CommentReply) => void;
  onDeleted: (commentId: string, parentId: string | null) => void;
  onReport?: (commentId: string) => void;
}

export function CommentItem({
  comment,
  serverId,
  currentUserId,
  isReplyOpen,
  onToggleReply,
  onReplyCreated,
  onDeleted,
  onReport,
}: CommentItemProps) {
  const { toast } = useToast();
  const confirmAction = useConfirm();
  const t = useTranslations("comments");
  const displayAuthorName = (author: Pick<CommentAuthor, "name">): string => {
    if (author.name && author.name.trim().length > 0) {
      return author.name.trim();
    }
    return t("anonymousName");
  };
  const [replyContent, setReplyContent] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleReplySubmit = async () => {
    const content = replyContent.trim();
    if (content.length === 0) {
      toast.error(t("replyEmpty"));
      return;
    }
    if (content.length > 1000) {
      toast.error(t("replyMaxLength"));
      return;
    }

    setIsSubmittingReply(true);

    try {
      const response = await fetch(`/api/servers/${serverId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          parentId: comment.id,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CreateCommentResponse;
      if (!response.ok || !payload.data) {
        toast.error(payload.error ?? t("replyFailed"));
        return;
      }

      onReplyCreated(comment.id, {
        id: payload.data.id,
        content: payload.data.content,
        createdAt: payload.data.createdAt,
        author: payload.data.author,
      });
      setReplyContent("");
      onToggleReply();
      toast.success(t("replySuccess"));
    } catch {
      toast.error(t("replyNetworkError"));
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleDelete = async (commentId: string, parentId: string | null, confirmText: string) => {
    const ok = await confirmAction({
      title: t("deleteConfirmTitle"),
      message: confirmText,
      confirmText: t("deleteConfirmAction"),
      danger: true,
    });
    if (!ok) {
      return;
    }

    setDeletingId(commentId);

    try {
      const response = await fetch(`/api/servers/${serverId}/comments/${commentId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as DeleteCommentResponse;
      if (!response.ok) {
        toast.error(payload.error ?? t("deleteFailed"));
        return;
      }

      onDeleted(commentId, parentId);
      toast.success(t("deleteSuccess"));
    } catch {
      toast.error(t("deleteNetworkError"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div id={`comment-${comment.id}`} className="border-b border-warm-200 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserAvatar
            src={comment.author.image}
            name={comment.author.name}
            className="h-8 w-8"
            fallbackClassName="bg-gradient-to-br from-coral to-coral-amber text-white"
          />
          <Link href={`/u/${comment.author.uid}`} className="m3-link text-sm font-medium">
            {displayAuthorName(comment.author)}
          </Link>
        </div>
        <span className="text-sm text-warm-500">{timeAgo(comment.createdAt)}</span>
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-warm-700">
        {comment.content}
      </p>

      <div className="mt-3 flex items-center justify-end gap-4">
        <button
          type="button"
          onClick={() => {
            onToggleReply();
          }}
          className="text-sm text-warm-500 transition-colors hover:text-warm-700"
        >
          {t("replyAction")}
        </button>
        {currentUserId && currentUserId !== comment.author.id && onReport && (
          <button
            type="button"
            onClick={() => onReport(comment.id)}
            className="text-sm text-warm-500 transition-colors hover:text-accent"
          >
            {t("reportAction")}
          </button>
        )}
        {currentUserId === comment.author.id && (
          <button
            type="button"
            disabled={deletingId === comment.id}
            onClick={() => handleDelete(comment.id, null, t("deleteCommentConfirm"))}
            className="text-sm text-warm-500 transition-colors hover:text-coral-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deletingId === comment.id ? t("deleting") : t("deleteAction")}
          </button>
        )}
      </div>

      {isReplyOpen && (
        <div className="m3-surface-soft mt-3 p-3">
          {currentUserId ? (
            <>
              <textarea
                value={replyContent}
                onChange={(event) => setReplyContent(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={t("replyPlaceholder")}
                className="m3-input w-full"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-warm-500">
                  {t("counter", { count: replyContent.length })}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleReply}
                    className="m3-btn m3-btn-tonal px-3 py-1.5 text-xs"
                  >
                    {t("replyCancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleReplySubmit}
                    disabled={isSubmittingReply}
                    className="m3-btn m3-btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmittingReply ? t("replySubmitting") : t("replySubmit")}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-warm-600">
              {t("replyLoginPromptPrefix")}
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(`/servers/${serverId}`)}`}
                className="m3-link mx-1"
              >
                {t("replyLoginLink")}
              </Link>
              {t("replyLoginPromptSuffix")}
            </p>
          )}
        </div>
      )}

      {comment.replies.length > 0 && (
        <div className="ml-8 mt-3 space-y-3 border-l-2 border-warm-200 pl-4">
          {comment.replies.map((reply) => (
            <div id={`comment-${reply.id}`} key={reply.id} className="m3-surface-soft p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UserAvatar
                    src={reply.author.image}
                    name={reply.author.name}
                    className="h-8 w-8"
                    fallbackClassName="bg-gradient-to-br from-coral to-coral-amber text-white"
                  />
                  <Link href={`/u/${reply.author.uid}`} className="m3-link text-sm font-medium">
                    {displayAuthorName(reply.author)}
                  </Link>
                </div>
                <span className="text-sm text-warm-500">{timeAgo(reply.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-warm-700">
                {reply.content}
              </p>

              {(currentUserId === reply.author.id || (currentUserId && currentUserId !== reply.author.id && onReport)) && (
                <div className="mt-2 flex justify-end gap-4">
                  {currentUserId && currentUserId !== reply.author.id && onReport && (
                    <button
                      type="button"
                      onClick={() => onReport(reply.id)}
                      className="text-sm text-warm-500 transition-colors hover:text-accent"
                    >
                      {t("reportAction")}
                    </button>
                  )}
                  {currentUserId === reply.author.id && (
                    <button
                      type="button"
                      disabled={deletingId === reply.id}
                      onClick={() => handleDelete(reply.id, comment.id, t("deleteReplyConfirm"))}
                      className="text-sm text-warm-500 transition-colors hover:text-coral-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingId === reply.id ? t("deleting") : t("deleteAction")}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
