export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { adminQueryChangelogsSchema, createChangelogSchema } from "@/lib/validation";
import type { AdminChangelogItem } from "@/lib/types";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/admin/changelog — 管理员获取更新日志列表（含草稿）。
 */
export async function GET(request: Request) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }

    const { searchParams } = new URL(request.url);
    const parsed = adminQueryChangelogsSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      published: searchParams.get("published") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { page, limit, published } = parsed.data;
    const offset = (page - 1) * limit;

    const where: Prisma.ChangelogWhereInput = {};
    if (published === "published") {
      where.published = true;
    } else if (published === "draft") {
      where.published = false;
    }

    const [total, changelogs] = await Promise.all([
      prisma.changelog.count({ where }),
      prisma.changelog.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { name: true } },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const data: AdminChangelogItem[] = changelogs.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      type: item.type as AdminChangelogItem["type"],
      published: item.published,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      authorName: item.author.name,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      data,
      pagination: { page, pageSize: limit, total, totalPages },
    });
  } catch (err) {
    logger.error("[api/admin/changelog] GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/admin/changelog — 创建更新日志。
 */
export async function POST(request: Request) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }

    const body: unknown = await request.json();
    const parsed = createChangelogSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { title, content, type, published } = parsed.data;

    const changelog = await prisma.changelog.create({
      data: {
        title,
        content,
        type,
        published,
        publishedAt: published ? new Date() : null,
        authorId: adminResult.userId,
      },
    });

    return NextResponse.json({ data: { id: changelog.id } }, { status: 201 });
  } catch (err) {
    logger.error("[api/admin/changelog] POST error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
