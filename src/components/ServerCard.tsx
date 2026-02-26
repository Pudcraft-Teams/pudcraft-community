"use client";

import Link from "next/link";
import Image from "next/image";
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
  const { name, host, port, description, tags, status, isVerified, iconUrl } = server;
  const checkedAtMs = Date.parse(status.checkedAt);
  const isStale =
    !Number.isFinite(checkedAtMs) || Date.now() - checkedAtMs > 15 * 60 * 1000;
  const isOnline = status.online;
  const statusText = isStale ? "状态未知" : isOnline ? "在线" : "离线";

  return (
    <Link
      href={`/servers/${server.id}`}
      className="m3-surface group block cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:border-slate-300 sm:p-5"
    >
      {/* 1. 名称 + 在线状态 */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="inline-flex h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
            <Image
              src={iconUrl || "/default-server-icon.png"}
              alt={`${name} 图标`}
              width={56}
              height={56}
              className="h-full w-full object-cover"
            />
          </span>

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
                isStale
                  ? "bg-slate-300"
                  : isOnline
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.35)]"
                    : "bg-slate-400"
              }`}
            />
            <span
              className={
                isStale
                  ? "text-slate-400"
                  : isOnline
                    ? "text-emerald-600"
                    : "text-slate-500"
              }
            >
              {statusText}
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
      {!isStale && isOnline && (
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
