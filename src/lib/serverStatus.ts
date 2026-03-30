import type { ServerStatusResponse } from "@/lib/types";

export const SERVER_STATUS_STALE_WINDOW_MS = 15 * 60 * 1000;

interface BuildServerStatusResponseInput {
  isOnline: boolean;
  playerCount: number | null;
  maxPlayers: number | null;
  lastPingedAt: Date | null;
  updatedAt: Date;
}

export function isServerStatusStale(checkedAt: Date, now = new Date()): boolean {
  return now.getTime() - checkedAt.getTime() > SERVER_STATUS_STALE_WINDOW_MS;
}

export function buildServerStatusResponse(
  input: BuildServerStatusResponseInput,
  now = new Date(),
): ServerStatusResponse {
  const checkedAt = input.lastPingedAt ?? input.updatedAt;

  return {
    online: input.isOnline,
    playerCount: input.playerCount,
    maxPlayers: input.maxPlayers,
    motd: null,
    favicon: null,
    checkedAt: checkedAt.toISOString(),
    isStale: isServerStatusStale(checkedAt, now),
  };
}
