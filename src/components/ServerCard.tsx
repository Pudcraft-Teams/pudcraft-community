"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FavoriteButton } from "@/components/FavoriteButton";
import type { ServerListItem } from "@/lib/types";

interface ServerCardProps {
  server: ServerListItem;
  initialFavorited?: boolean;
  showFavoriteButton?: boolean;
  onFavoriteChange?: (serverId: string, favorited: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
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
  className,
  style,
}: ServerCardProps) {
  const {
    name,
    host,
    port,
    description,
    tags,
    status,
    isVerified,
    iconUrl,
    visibility,
    joinMode,
  } = server;
  const checkedAtMs = Date.parse(status.checkedAt);
  const isStale = !Number.isFinite(checkedAtMs) || Date.now() - checkedAtMs > 15 * 60 * 1000;
  const isOnline = status.online;
  const statusText = isStale ? "状态未知" : isOnline ? "在线" : "离线";
  const isAddressHidden = host === "hidden" && port === 0;
  const isUnlisted = visibility === "unlisted";
  const showApplyBadge =
    joinMode === "apply" || joinMode === "apply_and_invite";
  const showInviteBadge =
    joinMode === "invite" || joinMode === "apply_and_invite";

  const [pingMs, setPingMs] = useState<number | null>(null);

  useEffect(() => {
    if (isStale || !isOnline) return;
    const start = performance.now();
    fetch(`/api/servers/${server.id}/ping`, { cache: "no-store" })
      .then(() => {
        setPingMs(Math.round(performance.now() - start));
      })
      .catch(() => {
        /* ignore */
      });
  }, [server.id, isOnline, isStale]);

  return (
    <Link
      href={`/servers/${server.psid}`}
      className={`group relative block overflow-hidden rounded-2xl border border-[#E8DDD4] bg-[#FFFAF6] transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(139,69,51,0.12)] animate-card-in${className ? ` ${className}` : ""}`}
      style={style}
    >
      {/* 顶部渐变条 */}
      <div className="h-1 bg-gradient-to-r from-[#D4715E] to-[#D4956A] opacity-60 transition-opacity group-hover:opacity-100" />

      <div className="p-5">
        {/* 1. 图标 + 名称 + 状态 */}
        <div className="mb-4 flex items-start gap-3.5">
          <span className="relative inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-xl shadow-sm shadow-[#8B4533]/8">
            <Image
              src={iconUrl || "/default-server-icon.png"}
              alt={`${name} 图标`}
              width={48}
              height={48}
              className="h-full w-full object-cover"
            />
            {/* 在线状态点 */}
            {!isStale && (
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#FFFAF6] ${
                  isOnline ? "bg-[#5B9A6E]" : "bg-[#9C8577]"
                }`}
              />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-[15px] font-bold text-[#4A3728] transition-colors group-hover:text-[#D4715E]">
                {name}
              </h3>
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
            </div>
            {/* 地址 */}
            {isAddressHidden ? (
              <p className="mt-0.5 text-xs text-[#9C8577] italic">地址隐藏</p>
            ) : (
              <p className="mt-0.5 break-all font-mono text-xs text-[#7A6B5F]">
                {host}
                {port !== 25565 ? `:${port}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* 2. 描述 */}
        {description && (
          <p className="mb-4 line-clamp-2 text-[13px] leading-relaxed text-[#4A3728]">{description}</p>
        )}

        {/* 3. 底部信息栏 */}
        <div className="flex items-center justify-between gap-2">
          {/* 标签 */}
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-[#FBEEE6] px-2 py-0.5 text-[11px] font-semibold text-[#8B4533]"
              >
                {tag}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="rounded-md bg-[#FBEEE6] px-2 py-0.5 text-[11px] font-semibold text-[#9C8577]">
                +{tags.length - 3}
              </span>
            )}
            {isVerified && (
              <span className="rounded-md bg-[#D4715E]/10 px-2 py-0.5 text-[11px] font-semibold text-[#D4715E]">
                ✓ 已认领
              </span>
            )}
          </div>

          {/* 在线人数 */}
          {!isStale && isOnline && (
            <span className="shrink-0 text-xs font-semibold text-[#5B9A6E]">
              {status.playerCount}/{status.maxPlayers}
            </span>
          )}
          {(isStale || !isOnline) && (
            <span className="shrink-0 text-xs text-[#9C8577]">{statusText}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
