"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { ServerCard } from "@/components/ServerCard";
import { applyFavoritesPageFavoriteChange } from "@/lib/favoritesPageState";
import type { ServerListItem } from "@/lib/types";

interface FavoritesPageClientProps {
  initialServers: ServerListItem[];
}

export function FavoritesPageClient({ initialServers }: FavoritesPageClientProps) {
  const t = useTranslations("favorites.page");
  const [servers, setServers] = useState(initialServers);

  if (servers.length === 0) {
    return (
      <EmptyState
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        action={{ label: t("emptyCtaLabel"), href: "/servers" }}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {servers.map((server) => (
        <ServerCard
          key={server.id}
          server={server}
          initialFavorited
          onFavoriteChange={(serverId, favorited) => {
            setServers((previous) =>
              applyFavoritesPageFavoriteChange(previous, serverId, favorited),
            );
          }}
        />
      ))}
    </div>
  );
}
