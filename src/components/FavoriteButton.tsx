"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface FavoriteButtonProps {
  serverId: string;
  initialFavorited?: boolean;
  size?: "sm" | "md";
  onChange?: (favorited: boolean) => void;
  className?: string;
}

interface FavoriteApiResponse {
  favorited?: boolean;
  error?: string;
}

function toApiPayload(raw: unknown): FavoriteApiResponse {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    favorited: typeof payload.favorited === "boolean" ? payload.favorited : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

/**
 * 收藏按钮。
 * 支持乐观更新、未登录跳转与卡片内点击拦截。
 */
export function FavoriteButton({
  serverId,
  initialFavorited,
  size = "md",
  onChange,
  className = "",
}: FavoriteButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();

  const [favorited, setFavorited] = useState<boolean>(initialFavorited ?? false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (typeof initialFavorited === "boolean") {
      setFavorited(initialFavorited);
      return;
    }

    if (status !== "authenticated") {
      setFavorited(false);
      return;
    }

    let cancelled = false;
    async function fetchFavoriteStatus() {
      try {
        const response = await fetch(`/api/servers/${serverId}/favorite`);
        const payload = toApiPayload(await response.json().catch(() => ({})));
        if (!response.ok) {
          return;
        }

        if (!cancelled && typeof payload.favorited === "boolean") {
          setFavorited(payload.favorited);
          onChange?.(payload.favorited);
        }
      } catch {
        // Ignore and keep current optimistic state.
      }
    }

    fetchFavoriteStatus();
    return () => {
      cancelled = true;
    };
  }, [initialFavorited, onChange, serverId, status]);

  const handleToggle = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (isPending) {
      return;
    }

    if (status === "loading") {
      return;
    }

    if (status !== "authenticated") {
      const callbackUrl = pathname && pathname.length > 0 ? pathname : "/";
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    const previous = favorited;
    const next = !previous;

    setFavorited(next);
    onChange?.(next);
    setIsPending(true);

    try {
      const response = await fetch(`/api/servers/${serverId}/favorite`, {
        method: next ? "POST" : "DELETE",
      });
      const payload = toApiPayload(await response.json().catch(() => ({})));

      if (!response.ok) {
        setFavorited(previous);
        onChange?.(previous);
        return;
      }

      if (typeof payload.favorited === "boolean") {
        setFavorited(payload.favorited);
        onChange?.(payload.favorited);
      }
    } catch {
      setFavorited(previous);
      onChange?.(previous);
    } finally {
      setIsPending(false);
    }
  };

  const baseSizeClass = size === "sm" ? "h-7 w-7 text-sm" : "h-8 w-8 text-base";
  const colorClass = favorited ? "text-amber-500" : "text-slate-400";

  return (
    <button
      type="button"
      aria-label={favorited ? "取消收藏" : "收藏服务器"}
      title={favorited ? "已收藏" : "收藏"}
      onClick={handleToggle}
      disabled={isPending}
      className={`inline-flex items-center justify-center rounded-full border border-slate-200 bg-white transition-transform hover:scale-110 hover:bg-slate-50 ${baseSizeClass} ${colorClass} ${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span aria-hidden>{favorited ? "★" : "☆"}</span>
    </button>
  );
}
