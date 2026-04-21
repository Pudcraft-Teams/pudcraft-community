"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
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

function resolveAuthorName(
  comment: ServerComment,
  t: ReturnType<typeof useTranslations>,
): string {
  const name = comment.author.name?.trim();
  if (name) {
    return name;
  }

  return t("anonymousUser");
}

/**
 * Recent-comments preview.
 * Fetches the latest five comments for the server and links to the public comment section.
 */
export function RecentComments({ serverId }: RecentCommentsProps) {
  const t = useTranslations("console.recentComments");
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
          throw new Error(payload.error ?? t("loadFailed"));
        }

        if (!cancelled) {
          setComments(payload.comments ?? []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          const message = fetchError instanceof Error ? fetchError.message : t("loadFailed");
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
  }, [serverId, t]);

  return (
    <section className="m3-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>

      {isLoading ? (
        <p className="mt-4 text-sm text-warm-500">{t("loading")}</p>
      ) : error ? (
        <p className="mt-4 text-sm text-coral-hover">{error}</p>
      ) : comments.length === 0 ? (
        <p className="mt-4 text-sm text-warm-500">{t("empty")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="flex items-start justify-between gap-3 border-b border-warm-100 pb-3 last:border-none last:pb-0"
            >
              <div className="flex min-w-0 items-start gap-2">
                <UserAvatar
                  src={comment.author.image}
                  name={comment.author.name}
                  className="h-8 w-8"
                  fallbackClassName="bg-gradient-to-br from-coral to-coral-amber text-white"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-warm-800">{resolveAuthorName(comment, t)}</p>
                  <p className="line-clamp-1 text-sm text-warm-600">{comment.content}</p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-warm-500">{timeAgo(comment.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      <Link href={`/servers/${serverId}`} className="m3-link mt-4 inline-flex items-center text-sm">
        {t("viewAll")}
      </Link>
    </section>
  );
}
