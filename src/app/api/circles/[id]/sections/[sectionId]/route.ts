export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { resolveCircleId } from "@/lib/circle-utils";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { moderateFields } from "@/lib/moderation";
import { getClientIp } from "@/lib/request-ip";
import { updateSectionSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string; sectionId: string }>;
}

/**
 * PUT /api/circles/:id/sections/:sectionId
 * 更新板块。站点管理员或圈子 OWNER / ADMIN 可操作。
 */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const userRole = authResult.user.role;

    const { id, sectionId } = await params;

    // 检查圈子是否存在
    const circleId = await resolveCircleId(id);
    if (!circleId) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    // 权限检查：站点管理员或圈子 OWNER/ADMIN
    const isAdmin = userRole === "admin";
    if (!isAdmin) {
      const membership = await prisma.circleMembership.findUnique({
        where: { unique_circle_membership: { userId, circleId } },
        select: { role: true },
      });
      if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
        return NextResponse.json({ error: "无权限" }, { status: 403 });
      }
    }

    // 检查板块是否属于此圈子
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true, circleId: true, name: true, description: true },
    });
    if (!section || section.circleId !== circleId) {
      return NextResponse.json({ error: "板块未找到" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateSectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // 内容审查（仅审查有变更的字段）
    const fieldsToModerate: Record<string, string> = {};
    if (parsed.data.name !== undefined && parsed.data.name !== section.name) {
      fieldsToModerate["板块名称"] = parsed.data.name;
    }
    if (
      parsed.data.description !== undefined &&
      parsed.data.description !== section.description
    ) {
      fieldsToModerate["描述"] = parsed.data.description ?? "";
    }

    if (Object.keys(fieldsToModerate).length > 0) {
      const modResult = await moderateFields(fieldsToModerate, "server", {
        userId,
        userIp: getClientIp(request),
      });
      if (!modResult.passed) {
        return NextResponse.json(
          { error: "内容包含违规信息，请修改后重新提交", detail: modResult.reason },
          { status: 422 },
        );
      }
    }

    const updated = await prisma.section.update({
      where: { id: sectionId },
      data: parsed.data,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        sortOrder: updated.sortOrder,
      },
    });
  } catch (error) {
    logger.error("[api/circles/[id]/sections/[sectionId]] Unexpected PUT error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/circles/:id/sections/:sectionId
 * 删除板块。站点管理员或圈子 OWNER / ADMIN 可操作。
 * 板块内的帖子 sectionId 会通过 onDelete: SetNull 自动置空。
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const userRole = authResult.user.role;

    const { id, sectionId } = await params;

    // 检查圈子是否存在
    const circleId = await resolveCircleId(id);
    if (!circleId) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    // 权限检查：站点管理员或圈子 OWNER/ADMIN
    const isAdmin = userRole === "admin";
    if (!isAdmin) {
      const membership = await prisma.circleMembership.findUnique({
        where: { unique_circle_membership: { userId, circleId } },
        select: { role: true },
      });
      if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
        return NextResponse.json({ error: "无权限" }, { status: 403 });
      }
    }

    // 检查板块是否属于此圈子
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true, circleId: true },
    });
    if (!section || section.circleId !== circleId) {
      return NextResponse.json({ error: "板块未找到" }, { status: 404 });
    }

    await prisma.section.delete({
      where: { id: sectionId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/circles/[id]/sections/[sectionId]] Unexpected DELETE error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
