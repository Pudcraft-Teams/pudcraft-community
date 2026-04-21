export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { prisma } from "@/lib/db";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError, translateAdminError } from "@/lib/admin";
import { adminQueryReportsSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/admin/reports — admin-only report listing.
 */
export async function GET(request: Request) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json(
        { error: translateAdminError(locale, adminResult.errorKey) },
        { status: adminResult.status },
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = adminQueryReportsSchema.safeParse(
      {
        page: searchParams.get("page") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
        status: searchParams.get("status") ?? undefined,
        targetType: searchParams.get("targetType") ?? undefined,
      },
      { errorMap: getZodErrorMap(locale) },
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: flattenZodErrorWithLocale(parsed.error, locale) },
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
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
