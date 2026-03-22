export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { resolveCircleId } from "@/lib/circle-utils";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getPublicUrl } from "@/lib/storage";
import { createCircleBanSchema } from "@/lib/validation";
import type { CircleBanItem } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/circles/:id/bans
 * Paginated list of bans with user info.
 * Requires OWNER or ADMIN of circle, or site admin.
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const userRole = authResult.user.role;

    const { id } = await params;

    const circleId = await resolveCircleId(id);
    if (!circleId) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    // Permission: site admin or circle OWNER/ADMIN
    const isAdmin = userRole === "admin";
    if (!isAdmin) {
      const membership = await prisma.circleMembership.findUnique({
        where: {
          unique_circle_membership: { userId, circleId },
        },
        select: { role: true },
      });

      if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
        return NextResponse.json({ error: "没有权限查看封禁列表" }, { status: 403 });
      }
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

    const where = { circleId };

    const [total, banRecords] = await Promise.all([
      prisma.circleBan.count({ where }),
      prisma.circleBan.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, uid: true, name: true, image: true },
          },
          banner: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    const bans: CircleBanItem[] = banRecords.map((b) => ({
      id: b.id,
      userId: b.userId,
      user: {
        id: b.user.id,
        uid: b.user.uid,
        name: b.user.name,
        image: getPublicUrl(b.user.image),
      },
      reason: b.reason,
      expiresAt: b.expiresAt?.toISOString() ?? null,
      bannedBy: b.bannedBy,
      banner: { id: b.banner.id, name: b.banner.name },
      createdAt: b.createdAt.toISOString(),
    }));

    return NextResponse.json({
      bans,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    logger.error("[api/circles/[id]/bans] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/circles/:id/bans
 * Ban a user from the circle.
 * Requires OWNER or ADMIN of circle, or site admin.
 * Cannot ban the OWNER.
 * Transaction: create ban, delete membership if exists, decrement memberCount.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const currentUserId = authResult.user.id;
    const userRole = authResult.user.role;

    const { id } = await params;

    const circleId = await resolveCircleId(id);
    if (!circleId) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    // Permission: site admin or circle OWNER/ADMIN
    const isAdmin = userRole === "admin";
    if (!isAdmin) {
      const membership = await prisma.circleMembership.findUnique({
        where: {
          unique_circle_membership: { userId: currentUserId, circleId },
        },
        select: { role: true },
      });

      if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
        return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });
      }
    }

    // Parse and validate body
    const body = await request.json().catch(() => null);
    const parsed = createCircleBanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { userId: targetUserId, reason, expiresAt } = parsed.data;

    // Check target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // Cannot ban OWNER of the circle
    const targetMembership = await prisma.circleMembership.findUnique({
      where: {
        unique_circle_membership: { userId: targetUserId, circleId },
      },
      select: { id: true, role: true },
    });

    if (targetMembership?.role === "OWNER") {
      return NextResponse.json({ error: "不能封禁圈主" }, { status: 403 });
    }

    // Transaction: create ban + remove membership + decrement memberCount
    try {
      await prisma.$transaction(async (tx) => {
        await tx.circleBan.create({
          data: {
            circleId,
            userId: targetUserId,
            reason: reason ?? null,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            bannedBy: currentUserId,
          },
        });

        // Delete membership if exists
        if (targetMembership) {
          await tx.circleMembership.delete({
            where: { id: targetMembership.id },
          });

          const updated = await tx.circle.update({
            where: { id: circleId },
            data: { memberCount: { decrement: 1 } },
            select: { memberCount: true },
          });

          // Prevent negative count
          if (updated.memberCount < 0) {
            await tx.circle.update({
              where: { id: circleId },
              data: { memberCount: 0 },
            });
          }
        }
      });

      return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
      // Handle unique constraint violation (already banned)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "该用户已被封禁" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    logger.error("[api/circles/[id]/bans] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
