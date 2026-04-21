import type { ServerListItem } from "@/lib/types";

export function applyFavoritesPageFavoriteChange(
  servers: ServerListItem[],
  serverId: string,
  favorited: boolean,
): ServerListItem[] {
  if (favorited) {
    return servers;
  }

  const next = servers.filter((server) => server.id !== serverId);
  return next.length === servers.length ? servers : next;
}
