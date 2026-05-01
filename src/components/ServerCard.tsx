"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { FavoriteButton } from "@/components/FavoriteButton";
import { isPrivateServersEnabled } from "@/lib/features";
import { TAG_TO_SWATCH, pickCoverClass } from "@/lib/server-cover";
import type { ServerListItem } from "@/lib/types";

interface ServerCardProps {
  server: ServerListItem;
  initialFavorited?: boolean;
  showFavoriteButton?: boolean;
  onFavoriteChange?: (serverId: string, favorited: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
  featured?: boolean;
}

export function ServerCard({
  server,
  initialFavorited,
  showFavoriteButton = true,
  onFavoriteChange,
  className,
  style,
  featured = false,
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
  const t = useTranslations("servers.common");
  const privateServersEnabled = isPrivateServersEnabled();
  const isStale = status.isStale;
  const isOnline = status.online;
  const isAddressHidden = host === "hidden" && port === 0;
  const showApplyBadge =
    privateServersEnabled &&
    (joinMode === "apply" || joinMode === "apply_and_invite");
  const showInviteBadge =
    privateServersEnabled &&
    (joinMode === "invite" || joinMode === "apply_and_invite");

  const coverClass = pickCoverClass(tags);
  const visibleTags = tags.slice(0, 2);
  const onlineLabel = isStale
    ? t("cardStatusUnknown")
    : isOnline
      ? `${status.playerCount}/${status.maxPlayers}`
      : t("cardStatusOffline");
  const onlineModifier = isStale || !isOnline ? " cover-online-off" : "";

  return (
    <article
      className={`player-card animate-card-in${featured ? " player-card-featured" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      <Link href={`/servers/${server.psid}`} className="block no-underline">
        <div className={`player-card-cover ${coverClass}`}>
          <div className="cover-tags">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="mode-tag"
                style={{ ["--swatch" as string]: TAG_TO_SWATCH[tag] ?? "#fff" }}
              >
                <span className="swatch" aria-hidden />
                {tag}
              </span>
            ))}
            {featured ? (
              <span className="mode-tag mode-tag-featured">
                {t("cardBadgeFeatured")}
              </span>
            ) : null}
            {isVerified ? (
              <span className="mode-tag mode-tag-verified">
                {t("cardBadgeVerified")}
              </span>
            ) : null}
            {showApplyBadge ? (
              <span className="mode-tag">
                {t("cardBadgeApply")}
              </span>
            ) : null}
            {showInviteBadge ? (
              <span className="mode-tag">
                {t("cardBadgeInvite")}
              </span>
            ) : null}
          </div>
          <div className={`cover-online${onlineModifier}`}>
            <span className="dot" aria-hidden />
            {onlineLabel}
          </div>
        </div>

        <div className="player-card-body">
          <div className="flex items-start gap-3">
            {iconUrl ? (
              <span className="relative inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-md border border-warm-200">
                <Image
                  src={iconUrl}
                  alt={t("cardIconAlt", { name })}
                  width={36}
                  height={36}
                  className="h-full w-full object-cover"
                />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="player-card-title truncate">{name}</div>
              {isAddressHidden ? (
                <div className="player-card-host">{t("cardAddressHidden")}</div>
              ) : (
                <div className="player-card-host break-all">
                  {host}
                  {port !== 25565 ? `:${port}` : ""}
                </div>
              )}
            </div>
          </div>

          {description ? (
            <p className="player-card-desc">{description}</p>
          ) : null}

          <div className="player-card-foot">
            <div className="player-card-meta">
              {(server.favoriteCount ?? 0) > 0 ? (
                <span className="text-warm-500">
                  {t("favoriteCount", { count: server.favoriteCount ?? 0 })}
                </span>
              ) : null}
            </div>
            {tags.length > 2 ? (
              <span className="adm-tag">+{tags.length - 2}</span>
            ) : null}
          </div>
        </div>
      </Link>

      {showFavoriteButton ? (
        <div className="player-card-fav">
          <FavoriteButton
            serverId={server.id}
            size="sm"
            className="player-card-fav-button"
            initialFavorited={initialFavorited}
            onChange={(favorited) => {
              onFavoriteChange?.(server.id, favorited);
            }}
          />
        </div>
      ) : null}
    </article>
  );
}
