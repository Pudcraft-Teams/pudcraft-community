"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { timeAgo } from "@/lib/time";
import type { ServerComment } from "@/lib/types";

interface CommentsResponse {
  comments?: ServerComment[];
  error?: string;
}

interface RecentCommentsProps {
  serverId: string;
}

function parseCommentsPayload(raw: unknown): CommentsResponse {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    comments: Array.isArray(payload.comments) ? (payload.comments as ServerComment[]) : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

function resolveAuthorName(comment: ServerComment): string {
  const name = comment.author.name?.trim();
  if (name) {
    return name;
  }

  return "匿名用户";
}

/**
 * 最近评论摘要。
 * 拉取该服务器最新 5 条评论并提供“查看全部评论”入口。
 */
export function RecentComments({ serverId }: RecentCommentsProps) {
  const [comments, setComments] = useState<ServerComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchComments() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/servers/${serverId}/comments?limit=5`, {
          cache: "no-store",
        });
        const payload = parseCommentsPayload(await response.json().catch(() => ({})));

        if (!response.ok) {
          throw new Error(payload.error ?? "评论加载失败");
        }

        if (!cancelled) {
          setComments(payload.comments ?? []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          const message = fetchError instanceof Error ? fetchError.message : "评论加载失败";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchComments();

    return () => {
      cancelled = true;
    };
  }, [serverId]);

  return (
    <section className="m3-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-slate-900">最近评论</h2>

      {isLoading ? (
        <p className="mt-4 text-sm text-slate-500">评论加载中...</p>
      ) : error ? (
        <p className="mt-4 text-sm text-rose-600">{error}</p>
      ) : comments.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">暂无评论，欢迎引导玩家留下第一条反馈。</p>
      ) : (
        <div className="mt-4 space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-none last:pb-0"
            >
              <div className="flex min-w-0 items-start gap-2">
                <UserAvatar
                  src={comment.author.image}
                  name={comment.author.name}
                  className="h-8 w-8"
                  fallbackClassName="bg-teal-600 text-white"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{resolveAuthorName(comment)}</p>
                  <p className="line-clamp-1 text-sm text-slate-600">{comment.content}</p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-slate-500">{timeAgo(comment.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      <Link href={`/servers/${serverId}`} className="m3-link mt-4 inline-flex items-center text-sm">
        查看全部评论 →
      </Link>
    </section>
  );
}
