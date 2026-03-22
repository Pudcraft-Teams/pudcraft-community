import { serializeJsonForScript } from "@/lib/json";
import { FeedPage } from "@/components/forum/FeedPage";

export const dynamic = "force-dynamic";

const SITE_URL = "https://pudcraft.cn";

export default function HomePage() {
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
      <FeedPage />
    </>
  );
}
