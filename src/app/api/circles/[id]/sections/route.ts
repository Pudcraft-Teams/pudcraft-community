export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { resolveCircleId } from "@/lib/circle-utils";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { moderateFields } from "@/lib/moderation";
import { getClientIp } from "@/lib/request-ip";
import { createSectionSchema } from "@/lib/validation";
import type { SectionItem } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/circles/:id/sections
 * 获取圈子的板块列表，按 sortOrder 升序排列。
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    const circleId = await resolveCircleId(id);
    if (!circleId) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    const sections = await prisma.section.findMany({
      where: { circleId },
      orderBy: { sortOrder: "asc" },
    });

    const data: SectionItem[] = sections.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      sortOrder: s.sortOrder,
    }));

    return NextResponse.json({ sections: data });
  } catch (error) {
    logger.error("[api/circles/[id]/sections] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/circles/:id/sections
 * 创建板块。站点管理员或圈子 OWNER / ADMIN 可操作。
 */
export async function POST(request: Request, { params }: RouteContext) {
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

    const body = await request.json().catch(() => null);
    const parsed = createSectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { name, description, sortOrder } = parsed.data;

    // 内容审查
    const modResult = await moderateFields(
      { 板块名称: name, ...(description ? { 描述: description } : {}) },
      "server",
      { userId, userIp: getClientIp(request) },
    );
    if (!modResult.passed) {
      return NextResponse.json(
        { error: "内容包含违规信息，请修改后重新提交", detail: modResult.reason },
        { status: 422 },
      );
    }

    const section = await prisma.section.create({
      data: {
        name,
        description: description || null,
        sortOrder,
        circleId,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: section.id,
          name: section.name,
          description: section.description,
          sortOrder: section.sortOrder,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("[api/circles/[id]/sections] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
