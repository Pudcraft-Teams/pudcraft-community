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
    joinMode,
  } = server;
  const checkedAtMs = Date.parse(status.checkedAt);
  const isStale = !Number.isFinite(checkedAtMs) || Date.now() - checkedAtMs > 15 * 60 * 1000;
  const isOnline = status.online;
  const statusText = isStale ? "未知" : isOnline ? "在线" : "离线";
  const isAddressHidden = host === "hidden" && port === 0;
  const showApplyBadge =
    joinMode === "apply" || joinMode === "apply_and_invite";
  const showInviteBadge =
    joinMode === "invite" || joinMode === "apply_and_invite";

  return (
    <Link
      href={`/servers/${server.psid}`}
      className={`group relative block rounded-xl border border-warm-200 bg-surface transition-all duration-150 ease-out hover:border-warm-300 hover:shadow-sm animate-card-in${className ? ` ${className}` : ""}`}
      style={style}
    >
      <div className="p-4">
        {/* 1. 图标 + 名称 + 状态 */}
        <div className="mb-3 flex items-start gap-3">
          <span className="relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-lg">
            <Image
              src={iconUrl || "/default-server-icon.png"}
              alt={`${name} 图标`}
              width={40}
              height={40}
              className="h-full w-full object-cover"
            />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-warm-800 transition-colors group-hover:text-accent">
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
              <p className="mt-0.5 text-xs text-warm-400">地址隐藏</p>
            ) : (
              <p className="mt-0.5 break-all font-mono text-xs text-warm-400">
                {host}
                {port !== 25565 ? `:${port}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* 2. 描述 */}
        {description && (
          <p className="mb-3 line-clamp-2 text-[13px] leading-relaxed text-warm-500">{description}</p>
        )}

        {/* 3. 底部信息栏 */}
        <div className="flex items-center justify-between gap-2">
          {/* 标签 */}
          <div className="flex min-w-0 flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded bg-warm-100 px-1.5 py-0.5 text-[11px] font-medium text-warm-500"
              >
                {tag}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="rounded bg-warm-100 px-1.5 py-0.5 text-[11px] font-medium text-warm-400">
                +{tags.length - 3}
              </span>
            )}
            {isVerified && (
              <span className="rounded bg-accent-muted px-1.5 py-0.5 text-[11px] font-medium text-accent">
                已认领
              </span>
            )}
            {showApplyBadge && (
              <span className="rounded bg-warm-100 px-1.5 py-0.5 text-[11px] font-medium text-warm-500">
                需申请
              </span>
            )}
            {showInviteBadge && (
              <span className="rounded bg-warm-100 px-1.5 py-0.5 text-[11px] font-medium text-warm-500">
                邀请制
              </span>
            )}
          </div>

          {/* 状态 + 人数 */}
          <div className="flex shrink-0 items-center gap-2">
            {!isStale && isOnline && (
              <>
                <span className="text-xs font-medium tabular-nums text-forest">
                  {status.playerCount}/{status.maxPlayers}
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-forest" />
              </>
            )}
            {(isStale || !isOnline) && (
              <>
                <span className="text-xs text-warm-400">{statusText}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${isStale ? "bg-warm-300" : "bg-warm-400"}`} />
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
