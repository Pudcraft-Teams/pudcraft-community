import { Prisma } from "@prisma/client";
import { HomePageClient } from "@/components/HomePageClient";
import { serializeJsonForScript } from "@/lib/json";
import type { ServerSort } from "@/components/SortButtons";
import { prisma } from "@/lib/db";
import type { ServerListItem } from "@/lib/types";

const SITE_URL = "https://pudcraft.cn";
const DEFAULT_LIMIT = 12;
const DEFAULT_SORT: ServerSort = "newest";
const SORT_SET = new Set<ServerSort>(["newest", "popular", "players", "name"]);

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface HomeQuery {
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

async function getInitialServerList(query: HomeQuery): Promise<{
  servers: ServerListItem[];
  totalPages: number;
}> {
  const where: Prisma.ServerWhereInput = {
    status: "approved",
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
        latency: true,
        lastPingedAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_LIMIT));
  const data: ServerListItem[] = servers.map((server) => ({
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    description: server.description,
    tags: server.tags,
    iconUrl: server.iconUrl,
    favoriteCount: server.favoriteCount,
    isVerified: server.isVerified,
    verifiedAt: server.verifiedAt?.toISOString() ?? null,
    status: {
      online: server.isOnline,
      playerCount: server.playerCount,
      maxPlayers: server.maxPlayers,
      motd: null,
      favicon: null,
      latencyMs: server.latency,
      checkedAt: (server.lastPingedAt ?? server.updatedAt).toISOString(),
    },
  }));

  return {
    servers: data,
    totalPages,
  };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const rawSearchParams = await searchParams;
  const page = parsePage(getFirstParam(rawSearchParams.page));
  const tag = getFirstParam(rawSearchParams.tag);
  const search = getFirstParam(rawSearchParams.search);
  const sort = parseSort(getFirstParam(rawSearchParams.sort));

  const { servers, totalPages } = await getInitialServerList({
    page,
    tag,
    search,
    sort,
  });

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "PudCraft Community",
    url: SITE_URL,
    description: "发现优质 Minecraft 服务器",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonForScript(websiteSchema) }}
      />
      <HomePageClient
        initialServers={servers}
        initialPage={page}
        initialSort={sort}
        initialTag={tag}
        initialSearch={search}
        initialTotalPages={totalPages}
      />
    </>
  );
}
