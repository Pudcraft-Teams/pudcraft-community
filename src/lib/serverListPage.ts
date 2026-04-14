import type { Prisma } from "@prisma/client";

import type { ServerListItem } from "@/lib/types";

export type ServerSort = "newest" | "popular" | "players" | "name";

export interface ServerListPageQuery {
  page: number;
  sort: ServerSort;
  tag: string;
  search: string;
}

interface RawServerListPageQuery {
  page?: string | string[];
  sort?: string | string[];
  tag?: string | string[];
  search?: string | string[];
}

const DEFAULT_LIMIT = 12;
const DEFAULT_SORT: ServerSort = "newest";
const SORT_VALUES = new Set<ServerSort>(["newest", "popular", "players", "name"]);

function getFirstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function normalizeText(value: string | string[] | undefined): string {
  const trimmed = getFirstValue(value).trim();
  return trimmed.length > 0 ? trimmed : "";
}

function parsePage(value: string | string[] | undefined): number {
  const parsed = Number(getFirstValue(value));
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.floor(parsed);
}

function parseSort(value: string | string[] | undefined): ServerSort {
  const candidate = getFirstValue(value);
  if (SORT_VALUES.has(candidate as ServerSort)) {
    return candidate as ServerSort;
  }

  return DEFAULT_SORT;
}

function buildOrderBy(sort: ServerSort): Prisma.ServerOrderByWithRelationInput[] {
  const orderBy: Prisma.ServerOrderByWithRelationInput[] = [{ isOnline: "desc" }];

  switch (sort) {
    case "popular":
      orderBy.push({ favoriteCount: "desc" }, { createdAt: "desc" });
      break;
    case "players":
      orderBy.push({ playerCount: "desc" }, { createdAt: "desc" });
      break;
    case "name":
      orderBy.push({ name: "asc" });
      break;
    case "newest":
    default:
      orderBy.push({ createdAt: "desc" });
      break;
  }

  return orderBy;
}

export function parseServerListQuery(raw: RawServerListPageQuery): ServerListPageQuery {
  return {
    page: parsePage(raw.page),
    sort: parseSort(raw.sort),
    tag: normalizeText(raw.tag),
    search: normalizeText(raw.search),
  };
}

export function buildServerListPath(query: ServerListPageQuery): string {
  const params = new URLSearchParams();

  if (query.tag) {
    params.set("tag", query.tag);
  }

  if (query.search) {
    params.set("search", query.search);
  }

  if (query.sort !== DEFAULT_SORT) {
    params.set("sort", query.sort);
  }

  if (query.page > 1) {
    params.set("page", String(query.page));
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}

export async function loadServerListPageData(query: ServerListPageQuery): Promise<{
  servers: ServerListItem[];
  totalPages: number;
}> {
  const [{ prisma }, { buildServerStatusResponse }, { getPublicUrl }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/serverStatus"),
    import("@/lib/storage"),
  ]);

  const where: Prisma.ServerWhereInput = {
    status: "approved",
    NOT: { visibility: "private", discoverable: false },
  };

  if (query.tag) {
    where.tags = { has: query.tag };
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [total, servers] = await Promise.all([
    prisma.server.count({ where }),
    prisma.server.findMany({
      where,
      skip: (query.page - 1) * DEFAULT_LIMIT,
      take: DEFAULT_LIMIT,
      orderBy: buildOrderBy(query.sort),
      select: {
        id: true,
        psid: true,
        name: true,
        host: true,
        port: true,
        description: true,
        tags: true,
        iconUrl: true,
        favoriteCount: true,
        isVerified: true,
        verifiedAt: true,
        isOnline: true,
        playerCount: true,
        maxPlayers: true,
        lastPingedAt: true,
        updatedAt: true,
        visibility: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_LIMIT));
  const data: ServerListItem[] = servers.map((server) => {
    const canSeeAddress = server.visibility === "public";

    return {
      id: server.id,
      psid: server.psid,
      name: server.name,
      host: canSeeAddress ? server.host : "hidden",
      port: canSeeAddress ? server.port : 0,
      description: server.description,
      tags: server.tags,
      iconUrl: getPublicUrl(server.iconUrl),
      favoriteCount: server.favoriteCount,
      isVerified: server.isVerified,
      verifiedAt: server.verifiedAt?.toISOString() ?? null,
      status: buildServerStatusResponse(server),
    };
  });

  return {
    servers: data,
    totalPages,
  };
}
