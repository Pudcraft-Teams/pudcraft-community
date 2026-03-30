import assert from "node:assert/strict";
import test from "node:test";

import {
  SERVER_STATUS_STALE_WINDOW_MS,
  buildServerStatusResponse,
} from "@/lib/serverStatus";

test("buildServerStatusResponse marks ping data stale after the freshness window", () => {
  const lastPingedAt = new Date("2026-03-30T00:00:00.000Z");
  const now = new Date(lastPingedAt.getTime() + SERVER_STATUS_STALE_WINDOW_MS + 1);

  assert.deepEqual(
    buildServerStatusResponse(
      {
        isOnline: true,
        playerCount: 12,
        maxPlayers: 50,
        lastPingedAt,
        updatedAt: new Date("2026-03-30T00:10:00.000Z"),
      },
      now,
    ),
    {
      online: true,
      playerCount: 12,
      maxPlayers: 50,
      motd: null,
      favicon: null,
      checkedAt: "2026-03-30T00:00:00.000Z",
      isStale: true,
    },
  );
});

test("buildServerStatusResponse falls back to updatedAt when no ping timestamp exists", () => {
  const updatedAt = new Date("2026-03-30T00:10:00.000Z");
  const now = new Date(updatedAt.getTime() + 5 * 60 * 1000);

  assert.deepEqual(
    buildServerStatusResponse(
      {
        isOnline: false,
        playerCount: null,
        maxPlayers: null,
        lastPingedAt: null,
        updatedAt,
      },
      now,
    ),
    {
      online: false,
      playerCount: null,
      maxPlayers: null,
      motd: null,
      favicon: null,
      checkedAt: "2026-03-30T00:10:00.000Z",
      isStale: false,
    },
  );
});
