export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * GET /api/users/search?q=xxx&limit=6
 * Search users by name prefix. Used for @mention autocomplete.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 6, 20);

    if (!q || q.length === 0) {
      return NextResponse.json({ users: [] });
    }

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
