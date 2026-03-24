export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

const tagSearchSchema = z.object({
  q: z.string().trim().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = await rateLimit(`tag-search:${ip}`, 30, 60);
    if (!rl.allowed) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = tagSearchSchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ tags: [] });
    }

    const { q, limit } = parsed.data;
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
