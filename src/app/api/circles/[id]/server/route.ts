export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { resolveCircleId } from "@/lib/circle-utils";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/circles/:id/server
 * 绑定服务器到圈子。
 * 权限：圈子 OWNER/ADMIN，且必须是该服务器的 owner。
 */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const circleId = await resolveCircleId(id);
    if (!circleId) {
      return NextResponse.json({ error: "圈子不存在" }, { status: 404 });
    }

    // Check circle membership (OWNER or ADMIN)
    const membership = await prisma.circleMembership.findUnique({
      where: { unique_circle_membership: { userId, circleId } },
      select: { role: true },
    });

    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as { serverId?: string } | null;
    const serverId = body?.serverId;

    if (!serverId || typeof serverId !== "string") {
      return NextResponse.json({ error: "请选择服务器" }, { status: 400 });
    }

    // Check that the server exists and belongs to this user
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, ownerId: true, name: true },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器不存在" }, { status: 404 });
    }

    if (server.ownerId !== userId) {
      return NextResponse.json({ error: "只能绑定自己认领的服务器" }, { status: 403 });
    }

    await prisma.circle.update({
      where: { id: circleId },
      data: { serverId },
    });

    return NextResponse.json({ success: true, serverName: server.name });
  } catch (err) {
    logger.error("[api/circles/[id]/server] PUT error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/circles/:id/server
 * 解绑服务器。
 * 权限：圈子 OWNER/ADMIN。
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const circleId = await resolveCircleId(id);
    if (!circleId) {
      return NextResponse.json({ error: "圈子不存在" }, { status: 404 });
    }

    const membership = await prisma.circleMembership.findUnique({
      where: { unique_circle_membership: { userId, circleId } },
      select: { role: true },
    });

    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    await prisma.circle.update({
      where: { id: circleId },
      data: { serverId: null },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[api/circles/[id]/server] DELETE error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
