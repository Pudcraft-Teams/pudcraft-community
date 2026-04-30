import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HomePageClient } from "@/components/HomePageClient";
import { auth } from "@/lib/auth";
import {
  loadServerListPageData,
  parseServerListQuery,
} from "@/lib/serverListPage";
import type { ServerListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("servers.list");
  return {
    title: t("metaListTitle"),
    description: t("metaListDescription"),
  };
}

interface ServersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ServersPage({ searchParams }: ServersPageProps) {
  const rawSearchParams = await searchParams;
  const query = parseServerListQuery(rawSearchParams);
  const session = await auth();

  let servers: ServerListItem[] = [];
  let totalPages = 1;
  let totalServers = 0;
  let onlineServers = 0;
  let activePlayers = 0;

  try {
    const result = await loadServerListPageData(query, {
      userId: session?.user?.id,
      role: session?.user?.role,
    });
    servers = result.servers;
    totalPages = result.totalPages;
    totalServers = result.total;
    onlineServers = result.totalOnlineServers;
    activePlayers = result.totalActivePlayers;
  } catch {
    // DB unavailable — render empty state
  }

  return (
    <HomePageClient
      initialServers={servers}
      initialPage={query.page}
      initialSort={query.sort}
      initialTag={query.tag}
      initialSearch={query.search}
      initialTotalPages={totalPages}
      basePath="/servers"
      variant="list"
      totalServers={totalServers}
      onlineServers={onlineServers}
      activePlayers={activePlayers}
    />
  );
}
