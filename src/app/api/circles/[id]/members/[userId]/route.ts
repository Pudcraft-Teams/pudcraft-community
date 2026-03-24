export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { resolveCircleId } from "@/lib/circle-utils";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ id: string; userId: string }>;
}

const updateRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
});

/**
 * DELETE /api/circles/:id/members/:userId
 * Leave (if userId === current user) or kick (if different user).
 *
 * Leave rules:
 *   - Cannot leave if user is OWNER.
 *
 * Kick rules:
 *   - Caller must be OWNER or ADMIN in this circle.
 *   - Cannot kick OWNER.
 *   - ADMIN cannot kick other ADMINs (only OWNER can).
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const currentUserId = authResult.user.id;

    const { id, userId: targetUserId } = await params;

    const circleId = await resolveCircleId(id);
    if (!circleId) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    if (targetUserId === currentUserId) {
      // --- LEAVE ---
      const membership = await prisma.circleMembership.findUnique({
        where: { unique_circle_membership: { userId: currentUserId, circleId } },
        select: { id: true, role: true },
      });

      if (!membership) {
        return NextResponse.json({ error: "你不是该圈子成员" }, { status: 404 });
      }

      if (membership.role === "OWNER") {
        return NextResponse.json({ error: "圈主不能退出圈子，请先转让圈主身份" }, { status: 403 });
      }

      await prisma.$transaction(async (tx) => {
        await tx.circleMembership.delete({
          where: { id: membership.id },
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
      });

      return NextResponse.json({ success: true });
    }

    // --- KICK ---
    // Verify caller has permission (OWNER or ADMIN)
    const callerMembership = await prisma.circleMembership.findUnique({
      where: { unique_circle_membership: { userId: currentUserId, circleId } },
      select: { role: true },
    });

    if (!callerMembership || (callerMembership.role !== "OWNER" && callerMembership.role !== "ADMIN")) {
      return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });
    }

    // Find target membership
    const targetMembership = await prisma.circleMembership.findUnique({
      where: { unique_circle_membership: { userId: targetUserId, circleId } },
      select: { id: true, role: true },
    });

    if (!targetMembership) {
      return NextResponse.json({ error: "该用户不是圈子成员" }, { status: 404 });
    }

    // Cannot kick OWNER
    if (targetMembership.role === "OWNER") {
      return NextResponse.json({ error: "不能移除圈主" }, { status: 403 });
    }

    // ADMIN cannot kick other ADMINs
    if (callerMembership.role === "ADMIN" && targetMembership.role === "ADMIN") {
      return NextResponse.json({ error: "管理员不能移除其他管理员" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
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
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "该用户不是圈子成员" }, { status: 404 });
    }
    logger.error("[api/circles/[id]/members/[userId]] Unexpected DELETE error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * PATCH /api/circles/:id/members/:userId
 * Change a member's role. Only OWNER can do this.
 * Body: { role: "ADMIN" | "MEMBER" }
 *
 * Rules:
 *   - Cannot change own role.
 *   - Cannot set role to OWNER (only one OWNER allowed).
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const currentUserId = authResult.user.id;

    const { id, userId: targetUserId } = await params;

    const circleId = await resolveCircleId(id);
    if (!circleId) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    // Caller must be OWNER
    const callerMembership = await prisma.circleMembership.findUnique({
      where: { unique_circle_membership: { userId: currentUserId, circleId } },
      select: { role: true },
    });

    if (!callerMembership || callerMembership.role !== "OWNER") {
      return NextResponse.json({ error: "只有圈主可以修改成员角色" }, { status: 403 });
    }

    // Cannot change own role
    if (targetUserId === currentUserId) {
      return NextResponse.json({ error: "不能修改自己的角色" }, { status: 400 });
    }

    // Parse and validate body
    const body = await request.json().catch(() => null);
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { role } = parsed.data;

    // Verify target is a member
    const targetMembership = await prisma.circleMembership.findUnique({
      where: { unique_circle_membership: { userId: targetUserId, circleId } },
      select: { id: true, role: true },
    });

    if (!targetMembership) {
      return NextResponse.json({ error: "该用户不是圈子成员" }, { status: 404 });
    }

    if (targetMembership.role === role) {
      return NextResponse.json({ success: true });
    }

    // Update role
    await prisma.circleMembership.update({
      where: { id: targetMembership.id },
      data: { role },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/circles/[id]/members/[userId]] Unexpected PATCH error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
