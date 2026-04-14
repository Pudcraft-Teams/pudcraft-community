import type { Prisma } from "@prisma/client";

import type { ServerSort } from "@/lib/serverListQuery";
import type { ServerListItem } from "@/lib/types";

export type { ServerListPageQuery, ServerSort } from "@/lib/serverListQuery";
export { buildServerListPath, parseServerListQuery } from "@/lib/serverListQuery";

const DEFAULT_LIMIT = 12;

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
