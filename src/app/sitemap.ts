import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

const SITE_URL = "https://pudcraft.cn";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  const servers = await db.server.findMany({
    where: {
      status: "approved",
    },
    select: {
      id: true,
      updatedAt: true,
    },
  });

  const serverPages: MetadataRoute.Sitemap = servers.map((server) => ({
    url: `${SITE_URL}/servers/${server.id}`,
    lastModified: server.updatedAt,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [...staticPages, ...serverPages];
}
