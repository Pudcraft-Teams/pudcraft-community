export const dynamic = "force-dynamic";

import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const SITE_URL = "https://pudcraft.cn";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let servers: { id: string; updatedAt: Date }[] = [];

  try {
    servers = await db.server.findMany({
      where: {
        status: "approved",
      },
      select: {
        id: true,
        updatedAt: true,
      },
    });
  } catch {
    // DB unavailable (e.g. build time) — return static pages only
  }

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/login`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/register`,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/forgot-password`,
      changeFrequency: "monthly",
      priority: 0.2,
    },
  ];

  const serverPages: MetadataRoute.Sitemap = servers.map((server) => ({
    url: `${SITE_URL}/servers/${server.id}`,
    lastModified: server.updatedAt,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [...staticPages, ...serverPages];
}
