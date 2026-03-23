export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 8, 20);

    if (!q || q.length === 0) {
      return NextResponse.json({ tags: [] });
    }

    const qLower = q.toLowerCase();

    const tags = await prisma.tag.findMany({
      where: {
        OR: [
          { name: { contains: qLower } },
          { aliases: { hasSome: [qLower] } },
        ],
      },
      select: { name: true, displayName: true, postCount: true },
      orderBy: { postCount: "desc" },
      take: limit,
    });

    const results = tags.map((t) => ({ tag: t.displayName, count: t.postCount }));
    return NextResponse.json({ tags: results });
  } catch (err) {
    logger.error("[api/tags/search] Unexpected error", err);
    return NextResponse.json({ error: "搜索失败" }, { status: 500 });
  }
}
