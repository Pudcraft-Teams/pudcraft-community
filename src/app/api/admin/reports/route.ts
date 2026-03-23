export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { adminQueryReportsSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/admin/reports — 管理员获取举报列表。
 */
export async function GET(request: Request) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }

    const { searchParams } = new URL(request.url);
    const parsed = adminQueryReportsSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      targetType: searchParams.get("targetType") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { page, limit, status, targetType } = parsed.data;

    const where: Prisma.ReportWhereInput = {};
    if (status !== "all") {
      where.status = status;
    }
    if (targetType !== "all") {
      where.targetType = targetType;
    }

    const offset = (page - 1) * limit;

    const [reports, total, pendingCount] = await Promise.all([
      prisma.report.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          reporter: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.report.count({ where }),
      prisma.report.count({ where: { status: "pending" } }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      reports,
      total,
      pendingCount,
      page,
      totalPages,
    });
  } catch (err) {
    logger.error("[api/admin/reports] Unexpected error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
