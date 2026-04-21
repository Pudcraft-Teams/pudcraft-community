import { HomePageClient } from "@/components/HomePageClient";
import { auth } from "@/lib/auth";
import {
  loadServerListPageData,
  parseServerListQuery,
} from "@/lib/serverListPage";
import type { ServerListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "服务器列表",
  description: "浏览国内优质 Minecraft 私人服务器，找到适合你的社区。",
};

interface ServersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ServersPage({ searchParams }: ServersPageProps) {
  const rawSearchParams = await searchParams;
  const query = parseServerListQuery(rawSearchParams);
  const session = await auth();

  let servers: ServerListItem[] = [];
  let totalPages = 1;

  try {
    const result = await loadServerListPageData(query, {
      userId: session?.user?.id,
      role: session?.user?.role,
    });
    servers = result.servers;
    totalPages = result.totalPages;
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
    />
  );
}
