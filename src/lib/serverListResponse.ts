import type { ServerListItem } from "@/lib/types";

export interface ServerListResponsePayload {
  data?: ServerListItem[];
  servers?: ServerListItem[];
  total?: number;
  totalPages?: number;
  pagination?: {
    total?: number;
    totalPages?: number;
  };
}

export interface NormalizedServerListResponse {
  servers: ServerListItem[];
  total: number;
  totalPages: number;
}

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

export function normalizeServerListResponse(
  payload: ServerListResponsePayload,
): NormalizedServerListResponse {
  const servers = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.servers)
      ? payload.servers
      : [];
  const total = normalizeNonNegativeInteger(
    payload.total ?? payload.pagination?.total,
    servers.length,
  );
  const totalPages = Math.max(
    1,
    normalizeNonNegativeInteger(payload.totalPages ?? payload.pagination?.totalPages, 1),
  );

  return { servers, total, totalPages };
}
