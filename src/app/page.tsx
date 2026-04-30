import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("servers.list");
  return {
    title: t("metaHomeTitle"),
    description: t("metaHomeDescription"),
  };
}

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const rawSearchParams = await searchParams;
  const query = parseServerListQuery(rawSearchParams);
  const session = await auth();
  const t = await getTranslations("servers.list");

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

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "PudCraft Community",
    url: SITE_URL,
    description: t("websiteSchemaDescription"),
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
        variant="home"
        totalServers={totalServers}
        onlineServers={onlineServers}
        activePlayers={activePlayers}
      />
    </>
  );
}
