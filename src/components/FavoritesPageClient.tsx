"use client";

import { useState } from "react";

import { EmptyState } from "@/components/EmptyState";
import { ServerCard } from "@/components/ServerCard";
import { applyFavoritesPageFavoriteChange } from "@/lib/favoritesPageState";
import type { ServerListItem } from "@/lib/types";

interface FavoritesPageClientProps {
  initialServers: ServerListItem[];
}

export function FavoritesPageClient({ initialServers }: FavoritesPageClientProps) {
  const [servers, setServers] = useState(initialServers);

  if (servers.length === 0) {
    return (
      <EmptyState
        title="暂无收藏的服务器"
        description="浏览服务器列表，点击星标收藏"
        action={{ label: "去发现服务器", href: "/servers" }}
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
