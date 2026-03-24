export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

/**
 * GET /api/users/search?q=xxx&limit=6
 * Search users by name prefix. Used for @mention autocomplete.
 */
const userSearchSchema = z.object({
  q: z.string().trim().min(1).max(50),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = await rateLimit(`user-search:${ip}`, 30, 60);
    if (!rl.allowed) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = userSearchSchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ users: [] });
    }

    const { q, limit } = parsed.data;

    // Search by name (case-insensitive contains) or uid (exact prefix)
    const uidNum = /^\d+$/.test(q) ? Number(q) : null;

    const users = await prisma.user.findMany({
      where: {
        isBanned: false,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          ...(uidNum !== null ? [{ uid: uidNum }] : []),
        ],
      },
      select: {
        id: true,
        uid: true,
        name: true,
        image: true,
      },
      take: limit,
      orderBy: { uid: "asc" },
    });

    return NextResponse.json({ users });
  } catch (err) {
    logger.error("[api/users/search] Unexpected error", err);
    return NextResponse.json({ error: "搜索失败" }, { status: 500 });
  }
}
