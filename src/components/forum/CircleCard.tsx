"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { CircleItem } from "@/lib/types";

interface CircleCardProps {
  circle: CircleItem;
  isMember?: boolean;
  onJoinChange?: (circleId: string, joined: boolean) => void;
}

export function CircleCard({ circle, isMember, onJoinChange }: CircleCardProps) {
  const [joined, setJoined] = useState(isMember ?? false);
  const [loading, setLoading] = useState(false);

  const handleJoinToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (loading) return;

      const next = !joined;
      // Optimistic update
      setJoined(next);
      onJoinChange?.(circle.id, next);
      setLoading(true);

      try {
        if (next) {
          const res = await fetch(`/api/circles/${circle.id}/members`, {
            method: "POST",
          });
          if (!res.ok) throw new Error("join failed");
        } else {
          const res = await fetch(`/api/circles/${circle.id}/members`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("leave failed");
        }
      } catch {
        // Revert on failure
        setJoined(!next);
        onJoinChange?.(circle.id, !next);
      } finally {
        setLoading(false);
      }
    },
    [joined, loading, circle.id, onJoinChange],
  );

  return (
    <Link
      href={`/c/${circle.slug}`}
      className="group flex items-center gap-3 rounded-xl border border-warm-200 bg-surface p-4 transition-all duration-150 hover:border-warm-300 hover:shadow-sm"
    >
      {/* Icon */}
      {circle.icon ? (
        <span className="relative inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-lg">
          <Image
            src={circle.icon}
            alt={`${circle.name} 图标`}
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        </span>
      ) : (
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-hover text-lg font-bold text-white">
          {circle.name.charAt(0)}
        </span>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-warm-800 transition-colors group-hover:text-accent">
          {circle.name}
        </h3>
        {circle.description && (
          <p className="mt-0.5 truncate text-xs text-warm-400">
            {circle.description}
          </p>
        )}
        <p className="mt-1 text-xs text-warm-400">
          {circle.memberCount} 成员
          <span className="mx-1.5">·</span>
          {circle.postCount} 帖子
        </p>
      </div>

      {/* Join button */}
      <button
        type="button"
        disabled={loading}
        onClick={handleJoinToggle}
        className={`m3-btn shrink-0 text-xs ${
          joined
            ? "m3-btn-tonal"
            : "m3-btn-primary"
        } ${loading ? "opacity-60" : ""}`}
      >
        {joined ? "已加入" : "加入"}
      </button>
    </Link>
  );
}
