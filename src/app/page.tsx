import { HomePageClient } from "@/components/HomePageClient";
import { auth } from "@/lib/auth";
import { serializeJsonForScript } from "@/lib/json";
import {
  loadServerListPageData,
  parseServerListQuery,
} from "@/lib/serverListPage";
import type { ServerListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const SITE_URL = "https://pudcraft.cn";

export const metadata = {
  title: "发现 Minecraft 服务器",
  description: "浏览国内优质 Minecraft 服务器，找到适合你的社区。",
};

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
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

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "PudCraft Community",
    url: SITE_URL,
    description: "PudCraft Minecraft 服务器社区，浏览服务器、筛选标签、搜索关键词",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/servers?search={search_term_string}`,
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
        initialPage={query.page}
        initialSort={query.sort}
        initialTag={query.tag}
        initialSearch={query.search}
        initialTotalPages={totalPages}
        basePath="/"
      />
    </>
  );
}
