export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { AdminModerationLogItem, AdminModerationStats } from "@/lib/types";
import { adminQueryModerationLogsSchema } from "@/lib/validation";

/**
 * GET /api/admin/moderation — 管理员获取审查日志列表。
 */
export async function GET(request: Request) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }

    const { searchParams } = new URL(request.url);
    const parsed = adminQueryModerationLogsSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      filter: searchParams.get("filter") ?? undefined,
      type: searchParams.get("type") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { page, limit, filter, type } = parsed.data;

    const where: Prisma.ModerationLogWhereInput = {};

    if (filter === "failed") {
      where.passed = false;
    } else if (filter === "passed") {
      where.passed = true;
    } else if (filter === "unreviewed") {
      where.passed = false;
      where.reviewed = false;
    }

    if (type !== "all") {
      where.contentType = type;
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, logs, statsRaw] = await Promise.all([
      prisma.moderationLog.count({ where }),
      prisma.moderationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { name: true },
          },
        },
      }),
      // 近 7 天统计
      Promise.all([
        prisma.moderationLog.count({
          where: { createdAt: { gte: sevenDaysAgo } },
        }),
        prisma.moderationLog.count({
          where: { createdAt: { gte: sevenDaysAgo }, passed: false },
        }),
        prisma.moderationLog.count({
          where: { createdAt: { gte: sevenDaysAgo }, passed: true },
        }),
        prisma.moderationLog.count({
          where: { createdAt: { gte: sevenDaysAgo }, passed: false, reviewed: false },
        }),
      ]),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const data: AdminModerationLogItem[] = logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      contentType: log.contentType,
      contentId: log.contentId,
      contentSnippet: log.contentSnippet,
      passed: log.passed,
      aiCategory: log.aiCategory,
      aiReason: log.aiReason,
      userId: log.userId,
      userName: log.user?.name ?? null,
      userIp: log.userIp,
      reviewed: log.reviewed,
      adminNote: log.adminNote,
    }));

    const stats: AdminModerationStats = {
      total: statsRaw[0],
      failed: statsRaw[1],
      passed: statsRaw[2],
      unreviewed: statsRaw[3],
    };

    return NextResponse.json({
      data,
      stats,
      pagination: { page, pageSize: limit, total, totalPages },
    });
  } catch (err) {
    logger.error("[api/admin/moderation] Unexpected error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
