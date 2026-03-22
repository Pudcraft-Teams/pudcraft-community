export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getPublicUrl } from "@/lib/storage";
import type { CircleMemberItem } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/circles/:id/members
 * Public. Paginated member list with user info and role.
 * Order: OWNER first, then ADMIN, then MEMBER; within each group by joinedAt.
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id: circleId } = await params;

    // Verify circle exists
    const circle = await prisma.circle.findUnique({
      where: { id: circleId },
      select: { id: true },
    });
    if (!circle) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

    const where = { circleId };

    const [total, memberships] = await Promise.all([
      prisma.circleMembership.count({ where }),
      prisma.circleMembership.findMany({
        where,
        orderBy: [
          // OWNER (0) < ADMIN (1) < MEMBER (2) — Prisma sorts enums by declaration order
          { role: "asc" },
          { joinedAt: "asc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              uid: true,
              name: true,
              image: true,
            },
          },
        },
      }),
    ]);

    const members: CircleMemberItem[] = memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      user: {
        id: m.user.id,
        uid: m.user.uid,
        name: m.user.name,
        image: getPublicUrl(m.user.image),
      },
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));

    return NextResponse.json({
      members,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    logger.error("[api/circles/[id]/members] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/circles/:id/members
 * Join a circle. Creates a MEMBER membership.
 * Checks for active circle ban before allowing join.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id: circleId } = await params;

    // Verify circle exists
    const circle = await prisma.circle.findUnique({
      where: { id: circleId },
      select: { id: true },
    });
    if (!circle) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    // Check if user is banned from this circle
    const activeBan = await prisma.circleBan.findFirst({
      where: {
        circleId,
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (activeBan) {
      return NextResponse.json({ error: "你已被该圈子封禁，无法加入" }, { status: 403 });
    }

    // Transaction: create membership + increment memberCount
    try {
      await prisma.$transaction(async (tx) => {
        await tx.circleMembership.create({
          data: {
            userId,
            circleId,
            role: "MEMBER",
          },
        });

        await tx.circle.update({
          where: { id: circleId },
          data: { memberCount: { increment: 1 } },
        });
      });

      return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
      // Handle unique constraint violation (already a member)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "已加入该圈子" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    logger.error("[api/circles/[id]/members] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
