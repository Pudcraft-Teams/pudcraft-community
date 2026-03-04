export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { queryChangelogsSchema } from "@/lib/validation";
import type { ChangelogItem } from "@/lib/types";

/**
 * GET /api/changelog — 获取已发布的更新日志列表。
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = queryChangelogsSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const where = { published: true, publishedAt: { not: null } } as const;

    const [total, changelogs] = await Promise.all([
      prisma.changelog.count({ where }),
      prisma.changelog.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { publishedAt: "desc" },
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          publishedAt: true,
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const data: ChangelogItem[] = changelogs.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      type: item.type as ChangelogItem["type"],
      publishedAt: item.publishedAt!.toISOString(),
    }));

    return NextResponse.json({
      data,
      pagination: { page, pageSize: limit, total, totalPages },
    });
  } catch (err) {
    logger.error("[api/changelog] Unexpected error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
