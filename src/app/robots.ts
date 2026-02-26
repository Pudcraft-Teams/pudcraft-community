import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/settings/", "/my-servers", "/console", "/favorites", "/submit"],
      },
    ],
    sitemap: "https://pudcraft.cn/sitemap.xml",
  };
}
