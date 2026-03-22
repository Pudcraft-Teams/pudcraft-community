import { Prisma } from "@prisma/client";
import { HomePageClient } from "@/components/HomePageClient";
import type { ServerSort } from "@/components/SortButtons";
import { prisma } from "@/lib/db";
import { getPublicUrl } from "@/lib/storage";
import type { ServerListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "服务器列表",
  description: "浏览国内优质 Minecraft 私人服务器，找到适合你的社区。",
};

const DEFAULT_LIMIT = 12;
const DEFAULT_SORT: ServerSort = "newest";
const SORT_SET = new Set<ServerSort>(["newest", "popular", "players", "name"]);

interface ServersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface ServersQuery {
  page: number;
  sort: ServerSort;
  tag: string;
  search: string;
}

function getFirstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function parseSort(value: string): ServerSort {
  if (SORT_SET.has(value as ServerSort)) {
    return value as ServerSort;
  }
  return DEFAULT_SORT;
}

function parsePage(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
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

async function getServerList(query: ServersQuery): Promise<{
  servers: ServerListItem[];
  totalPages: number;
}> {
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
      status: {
        online: server.isOnline,
        playerCount: server.playerCount,
        maxPlayers: server.maxPlayers,
        motd: null,
        favicon: null,
        checkedAt: (server.lastPingedAt ?? server.updatedAt).toISOString(),
      },
    };
  });

  return {
    servers: data,
    totalPages,
  };
}

export default async function ServersPage({ searchParams }: ServersPageProps) {
  const rawSearchParams = await searchParams;
  const page = parsePage(getFirstParam(rawSearchParams.page));
  const tag = getFirstParam(rawSearchParams.tag);
  const search = getFirstParam(rawSearchParams.search);
  const sort = parseSort(getFirstParam(rawSearchParams.sort));

  let servers: Awaited<ReturnType<typeof getServerList>>["servers"] = [];
  let totalPages = 1;

  try {
    const result = await getServerList({ page, tag, search, sort });
    servers = result.servers;
    totalPages = result.totalPages;
  } catch {
    // DB unavailable — render empty state
  }

  return (
    <HomePageClient
      initialServers={servers}
      initialPage={page}
      initialSort={sort}
      initialTag={tag}
      initialSearch={search}
      initialTotalPages={totalPages}
    />
  );
}
