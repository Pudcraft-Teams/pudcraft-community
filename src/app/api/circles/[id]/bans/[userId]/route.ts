export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { resolveCircleId } from "@/lib/circle-utils";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ id: string; userId: string }>;
}

/**
 * DELETE /api/circles/:id/bans/:userId
 * Unban a user from the circle.
 * Requires OWNER or ADMIN of circle, or site admin.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const currentUserId = authResult.user.id;
    const userRole = authResult.user.role;

    const { id, userId: targetUserId } = await params;

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

    // Find and delete the ban
    const ban = await prisma.circleBan.findUnique({
      where: {
        unique_circle_ban: { circleId, userId: targetUserId },
      },
      select: { id: true },
    });

    if (!ban) {
      return NextResponse.json({ error: "该用户未被封禁" }, { status: 404 });
    }

    await prisma.circleBan.delete({
      where: { id: ban.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/circles/[id]/bans/[userId]] Unexpected DELETE error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
