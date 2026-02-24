"use client";

import Link from "next/link";
import { FavoriteButton } from "@/components/FavoriteButton";
import type { ServerListItem } from "@/lib/types";

interface ServerCardProps {
  server: ServerListItem;
  initialFavorited?: boolean;
  showFavoriteButton?: boolean;
  onFavoriteChange?: (serverId: string, favorited: boolean) => void;
}

/**
 * 服务器信息卡片 —— 展示名称、状态、玩家数、延迟、标签等核心信息。
 * 信息密度适中，字段顺序固定（见 .cursorrules）。
 */
export function ServerCard({
  server,
  initialFavorited,
  showFavoriteButton = true,
  onFavoriteChange,
}: ServerCardProps) {
  const { name, host, port, description, tags, status, isVerified } = server;
  const isOnline = status.online;

  return (
    <Link
      href={`/servers/${server.id}`}
      className="m3-surface group block cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:border-slate-300 sm:p-5"
    >
      {/* 1. 名称 + 在线状态 */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-slate-900 transition-colors group-hover:text-slate-700">
            {name}
          </h3>
          {isVerified && (
            <span
              className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 ring-1 ring-teal-100"
              title="已认领 - 管理员已验证"
            >
              ✓ 已认领
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showFavoriteButton && (
            <FavoriteButton
              serverId={server.id}
              size="sm"
              initialFavorited={initialFavorited}
              onChange={(favorited) => {
                onFavoriteChange?.(server.id, favorited);
              }}
            />
          )}
          <span className="flex items-center gap-1.5 text-xs">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isOnline ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.35)]" : "bg-slate-400"
              }`}
            />
            <span className={isOnline ? "text-emerald-600" : "text-slate-500"}>
              {isOnline ? "在线" : "离线"}
            </span>
          </span>
        </div>
      </div>

      {/* 2. 服务器地址 */}
      <p className="mb-2 break-all font-mono text-xs text-slate-500">
        {host}
        {port !== 25565 ? `:${port}` : ""}
      </p>

      {/* 3. 简短描述（最多 2 行） */}
      {description && (
        <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-slate-600">{description}</p>
      )}

      {/* 4. 在线人数 + 延迟 */}
      {isOnline && (
        <div className="mb-3 flex items-center gap-3 text-xs">
          <span className="text-slate-600">
            <span className="font-medium text-slate-800">{status.playerCount}</span>
            <span> / {status.maxPlayers} 在线</span>
          </span>
          {status.latencyMs !== null && (
            <span
              className={
                status.latencyMs < 50
                  ? "text-emerald-600"
                  : status.latencyMs < 100
                    ? "text-amber-600"
                    : "text-rose-600"
              }
            >
              {status.latencyMs}ms
            </span>
          )}
        </div>
      )}

      {/* 5. 标签 Chips */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
