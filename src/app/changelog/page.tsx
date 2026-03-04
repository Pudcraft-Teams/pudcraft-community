export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { ChangelogList } from "./ChangelogList";
import type { ChangelogItem, ChangelogType } from "@/lib/types";

export const metadata: Metadata = {
  title: "更新日志",
  description: "PudCraft Community 平台更新日志，了解最新功能、修复和改进。",
};

export default async function ChangelogPage() {
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
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-slate-900">更新日志</h1>
      <p className="mb-8 text-sm text-slate-500">了解 PudCraft Community 的最新变化</p>
      <ChangelogList initialData={data} initialTotal={total} />
    </div>
  );
}
