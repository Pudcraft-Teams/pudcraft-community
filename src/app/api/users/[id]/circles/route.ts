export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getPublicUrl } from "@/lib/storage";

import type { CircleItem } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/users/:id/circles -- Get circles a user has joined.
 * Returns public circle info only.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id: userId } = await params;

    const memberships = await prisma.circleMembership.findMany({
      where: { userId },
      orderBy: { joinedAt: "desc" },
      include: {
        circle: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            icon: true,
            memberCount: true,
            postCount: true,
            createdAt: true,
          },
        },
      },
    });

    const circles: CircleItem[] = memberships.map((m) => ({
      id: m.circle.id,
      name: m.circle.name,
      slug: m.circle.slug,
      description: m.circle.description,
      icon: getPublicUrl(m.circle.icon),
      memberCount: m.circle.memberCount,
      postCount: m.circle.postCount,
      createdAt: m.circle.createdAt.toISOString(),
    }));

    return NextResponse.json({ circles });
  } catch (err) {
    logger.error("[api/users/[id]/circles] Unexpected GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
