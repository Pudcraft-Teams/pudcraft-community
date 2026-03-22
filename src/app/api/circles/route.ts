export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/request-ip";
import { moderateFields } from "@/lib/moderation";
import { circleListQuerySchema, createCircleSchema } from "@/lib/validation";
import type { CircleItem, CircleListResponse } from "@/lib/types";

/**
 * GET /api/circles — 获取圈子列表。
 * 支持分页、关键词搜索与排序（popular / newest）。
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const parsed = circleListQuerySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { page, limit, search, sort } = parsed.data;

    // --- 构建 where 条件 ---
    const where: { name?: { contains: string; mode: "insensitive" } } = {};
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    // --- 排序 ---
    const orderBy =
      sort === "newest"
        ? [{ createdAt: "desc" as const }]
        : [{ memberCount: "desc" as const }, { createdAt: "desc" as const }];

    // --- 并行查询总数和数据 ---
    const [total, circles] = await Promise.all([
      prisma.circle.count({ where }),
      prisma.circle.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    // --- 如果用户已登录，查询加入状态 ---
    const session = await auth();
    let memberCircleIds: Set<string> = new Set();
    if (session?.user?.id && circles.length > 0) {
      const memberships = await prisma.circleMembership.findMany({
        where: {
          userId: session.user.id,
          circleId: { in: circles.map((c) => c.id) },
        },
        select: { circleId: true },
      });
      memberCircleIds = new Set(memberships.map((m) => m.circleId));
    }

    const data: CircleItem[] = circles.map((circle) => ({
      id: circle.id,
      name: circle.name,
      slug: circle.slug,
      description: circle.description,
      icon: circle.icon,
      memberCount: circle.memberCount,
      postCount: circle.postCount,
      createdAt: circle.createdAt.toISOString(),
      ...(session?.user?.id ? { isMember: memberCircleIds.has(circle.id) } : {}),
    }));

    const response: CircleListResponse = {
      circles: data,
      total,
      page,
      totalPages,
    };

    return NextResponse.json(response);
  } catch (err) {
    logger.error("[api/circles] Unexpected GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/circles — 创建圈子。
 * 需登录用户访问，同时创建 OWNER 成员关系。
 */
export async function POST(request: Request) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const body = await request.json().catch(() => null);
    const parsed = createCircleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { name, slug, description } = parsed.data;

    // --- 检查 slug 唯一性 ---
    const existingSlug = await prisma.circle.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existingSlug) {
      return NextResponse.json({ error: "该圈子标识已被使用" }, { status: 409 });
    }

    // --- 内容审查 ---
    const clientIp = getClientIp(request);
    const modResult = await moderateFields(
      { 名称: name, 简介: description ?? "" },
      "server",
      { userId, userIp: clientIp },
    );
    if (!modResult.passed) {
      return NextResponse.json(
        { error: "内容包含违规信息，请修改后重新提交", detail: modResult.reason },
        { status: 422 },
      );
    }

    // --- 事务：创建圈子 + OWNER 成员关系 + memberCount=1 ---
    const circle = await prisma.$transaction(async (tx) => {
      const created = await tx.circle.create({
        data: {
          name,
          slug,
          description: description || null,
          creatorId: userId,
          memberCount: 1,
        },
      });

      await tx.circleMembership.create({
        data: {
          userId,
          circleId: created.id,
          role: "OWNER",
        },
      });

      return created;
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: circle.id,
          name: circle.name,
          slug: circle.slug,
          description: circle.description,
          icon: circle.icon,
          memberCount: circle.memberCount,
          postCount: circle.postCount,
          createdAt: circle.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[api/circles] Unexpected POST error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
