"use client";

import Link from "next/link";
import { useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { useToast } from "@/hooks/useToast";
import { timeAgo } from "@/lib/time";
import type { CommentReply, ServerComment } from "@/lib/types";

interface CreateCommentResponse {
  data?: {
    id: string;
    content: string;
    createdAt: string;
    parentId: string | null;
    author: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
    };
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
}

function displayAuthorName(author: { name: string | null; email: string }): string {
  if (author.name && author.name.trim().length > 0) {
    return author.name.trim();
  }
  return author.email.split("@")[0] ?? "匿名用户";
}

export function CommentItem({
  comment,
  serverId,
  currentUserId,
  isReplyOpen,
  onToggleReply,
  onReplyCreated,
  onDeleted,
}: CommentItemProps) {
  const { toast } = useToast();
  const [replyContent, setReplyContent] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleReplySubmit = async () => {
    const content = replyContent.trim();
    if (content.length === 0) {
      toast.error("回复内容不能为空");
      return;
    }
    if (content.length > 1000) {
      toast.error("回复内容最多 1000 字");
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
        toast.error(payload.error ?? "回复失败，请稍后重试");
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
      toast.success("回复成功");
    } catch {
      toast.error("网络异常，回复失败");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleDelete = async (
    commentId: string,
    parentId: string | null,
    confirmText: string,
  ) => {
    if (!window.confirm(confirmText)) {
      return;
    }

    setDeletingId(commentId);

    try {
      const response = await fetch(`/api/servers/${serverId}/comments/${commentId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as DeleteCommentResponse;
      if (!response.ok) {
        toast.error(payload.error ?? "删除失败，请稍后重试");
        return;
      }

      onDeleted(commentId, parentId);
      toast.success("删除成功");
    } catch {
      toast.error("网络异常，删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div id={`comment-${comment.id}`} className="border-b border-slate-200 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserAvatar
            src={comment.author.image}
            name={comment.author.name}
            email={comment.author.email}
            className="h-8 w-8"
            fallbackClassName="bg-teal-600 text-white"
          />
          <Link href={`/user/${comment.author.id}`} className="m3-link text-sm font-medium">
            {displayAuthorName(comment.author)}
          </Link>
        </div>
        <span className="text-sm text-slate-500">{timeAgo(comment.createdAt)}</span>
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
        {comment.content}
      </p>

      <div className="mt-3 flex items-center justify-end gap-4">
        <button
          type="button"
          onClick={() => {
            onToggleReply();
          }}
          className="text-sm text-slate-500 transition-colors hover:text-slate-700"
        >
          回复
        </button>
        {currentUserId === comment.author.id && (
          <button
            type="button"
            disabled={deletingId === comment.id}
            onClick={() =>
              handleDelete(
                comment.id,
                null,
                "确定删除这条评论吗？删除后其下所有回复也会一起删除。",
              )
            }
            className="text-sm text-slate-500 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deletingId === comment.id ? "删除中..." : "删除"}
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
                placeholder="写下你的回复..."
                className="m3-input w-full"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">{replyContent.length}/1000</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleReply}
                    className="m3-btn m3-btn-tonal px-3 py-1.5 text-xs"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleReplySubmit}
                    disabled={isSubmittingReply}
                    className="m3-btn m3-btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmittingReply ? "回复中..." : "回复"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              请先
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(`/servers/${serverId}`)}`}
                className="m3-link mx-1"
              >
                登录
              </Link>
              后再回复
            </p>
          )}
        </div>
      )}

      {comment.replies.length > 0 && (
        <div className="ml-8 mt-3 space-y-3 border-l-2 border-slate-200 pl-4">
          {comment.replies.map((reply) => (
            <div id={`comment-${reply.id}`} key={reply.id} className="m3-surface-soft p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UserAvatar
                    src={reply.author.image}
                    name={reply.author.name}
                    email={reply.author.email}
                    className="h-8 w-8"
                    fallbackClassName="bg-teal-600 text-white"
                  />
                  <Link href={`/user/${reply.author.id}`} className="m3-link text-sm font-medium">
                    {displayAuthorName(reply.author)}
                  </Link>
                </div>
                <span className="text-sm text-slate-500">{timeAgo(reply.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                {reply.content}
              </p>

              {currentUserId === reply.author.id && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={deletingId === reply.id}
                    onClick={() =>
                      handleDelete(reply.id, comment.id, "确定删除这条回复吗？")
                    }
                    className="text-sm text-slate-500 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletingId === reply.id ? "删除中..." : "删除"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
