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
    description: "PudCraft Minecraft 社区论坛，发现圈子、分享动态、交流讨论",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/search?q={search_term_string}`,
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
