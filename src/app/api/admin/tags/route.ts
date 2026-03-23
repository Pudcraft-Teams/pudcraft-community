export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { adminQueryTagsSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/admin/tags — 管理员获取话题列表（分页）。
 */
export async function GET(request: Request) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }

    const { searchParams } = new URL(request.url);
    const parsed = adminQueryTagsSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { page, limit, search } = parsed.data;
    const offset = (page - 1) * limit;

    const where: Prisma.TagWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, tags] = await Promise.all([
      prisma.tag.count({ where }),
      prisma.tag.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { postCount: "desc" },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      tags: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        displayName: tag.displayName,
        aliases: tag.aliases,
        postCount: tag.postCount,
        createdAt: tag.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages,
    });
  } catch (err) {
    logger.error("[api/admin/tags] GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
