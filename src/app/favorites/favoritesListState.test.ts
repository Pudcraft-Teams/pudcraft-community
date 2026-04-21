import assert from "node:assert/strict";
import test from "node:test";

import type { ServerListItem } from "@/lib/types";
import { applyFavoritesPageFavoriteChange } from "@/lib/favoritesPageState";

function createServer(id: string, name: string): ServerListItem {
  return {
    id,
    psid: Number(id.replace(/\D/g, "") || "1"),
    name,
    host: `${name.toLowerCase()}.example.com`,
    port: 25565,
    description: `${name} description`,
    tags: ["生存"],
    iconUrl: null,
    favoriteCount: 1,
    isVerified: true,
    verifiedAt: null,
    status: {
      online: true,
      playerCount: 12,
      maxPlayers: 50,
      motd: null,
      favicon: null,
      checkedAt: "2026-04-19T00:00:00.000Z",
      isStale: false,
    },
    visibility: "public",
    joinMode: "open",
  };
}

test("favorites page removes an unfavorited server immediately", () => {
  const servers = [createServer("server-1", "Alpha"), createServer("server-2", "Beta")];

  const next = applyFavoritesPageFavoriteChange(servers, "server-1", false);

  assert.deepEqual(
    next.map((server) => server.id),
    ["server-2"],
  );
});

test("favorites page keeps the list stable when a visible card reports favorited", () => {
  const servers = [createServer("server-1", "Alpha")];

  const next = applyFavoritesPageFavoriteChange(servers, "server-1", true);

  assert.equal(next, servers);
});
