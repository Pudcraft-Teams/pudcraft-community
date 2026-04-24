export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { ChangelogList } from "./ChangelogList";
import type { ChangelogItem, ChangelogType } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("changelog");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function ChangelogPage() {
  const t = await getTranslations("changelog");
  const changelogs = await prisma.changelog.findMany({
    where: { published: true, publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      content: true,
      type: true,
      publishedAt: true,
    },
  });

  const data: ChangelogItem[] = changelogs.map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    type: item.type as ChangelogType,
    publishedAt: item.publishedAt!.toISOString(),
  }));

  const total = await prisma.changelog.count({
    where: { published: true, publishedAt: { not: null } },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-warm-800">{t("heading")}</h1>
      <p className="mb-8 text-sm text-warm-500">{t("subtitle")}</p>
      <ChangelogList initialData={data} initialTotal={total} />
    </div>
  );
}
