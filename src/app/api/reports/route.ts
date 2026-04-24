export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { getZodErrorMap } from "@/lib/i18nZod";
import { createReportSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";
import type { Locale } from "@/i18n/config";
import { createTranslator } from "next-intl";
import zhMessages from "../../../../messages/zh.json";
import enMessages from "../../../../messages/en.json";

const REPORT_MESSAGES: Record<Locale, typeof zhMessages> = {
  zh: zhMessages,
  en: enMessages,
};

/**
 * Success payload factory used by both the Route Handler and unit tests.
 * Kept as a synchronous helper so the route test can call it without a
 * Next.js runtime. Locale defaults to `zh` to preserve the legacy string
 * the test pins to.
 */
export function buildCreateReportSuccessPayload(locale: Locale = "zh") {
  const t = createTranslator({
    locale,
    namespace: "errors.api.reports",
    messages: REPORT_MESSAGES[locale],
  });
  return {
    success: true,
    message: t("submitSuccess"),
  };
}

/**
 * POST /api/reports
 * Submits a user report against a server, comment, or user.
 */
export async function POST(request: NextRequest) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tReports = await getTranslations({ locale, namespace: "errors.api.reports" });
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    // Parse & validate the body.
    const body: unknown = await request.json();
    const parsed = createReportSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? tReports("invalidRequest") },
        { status: 400 },
      );
    }

    const { targetType, targetId, category, description } = parsed.data;

    // Cannot report yourself.
    if (targetType === "user" && targetId === userId) {
      return NextResponse.json({ error: tReports("cannotReportSelf") }, { status: 400 });
    }

    // Validate target exists & disallow reporting your own content.
    if (targetType === "server") {
      const server = await prisma.server.findUnique({
        where: { id: targetId },
        select: { id: true, ownerId: true },
      });
      if (!server) {
        return NextResponse.json({ error: tReports("targetServerNotFound") }, { status: 404 });
      }
      if (server.ownerId === userId) {
        return NextResponse.json({ error: tReports("cannotReportSelfServer") }, { status: 400 });
      }
    } else if (targetType === "comment") {
      const comment = await prisma.serverComment.findUnique({
        where: { id: targetId },
        select: { id: true, authorId: true },
      });
      if (!comment) {
        return NextResponse.json({ error: tReports("targetCommentNotFound") }, { status: 404 });
      }
      if (comment.authorId === userId) {
        return NextResponse.json({ error: tReports("cannotReportSelfComment") }, { status: 400 });
      }
    } else if (targetType === "user") {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!targetUser) {
        return NextResponse.json({ error: tReports("targetUserNotFound") }, { status: 404 });
      }
    }

    // Reputation-aware rate limit.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dismissedCount = await prisma.report.count({
      where: {
        reporterId: userId,
        status: "dismissed",
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    let dailyLimit: number;
    if (dismissedCount >= 6) {
      dailyLimit = 1;
    } else if (dismissedCount >= 3) {
      dailyLimit = 3;
    } else {
      dailyLimit = 10;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayReportCount = await prisma.report.count({
      where: {
        reporterId: userId,
        createdAt: { gte: todayStart },
      },
    });

    if (todayReportCount >= dailyLimit) {
      return NextResponse.json(
        { error: tReports("dailyLimit") },
        { status: 429 },
      );
    }

    // Duplicate-report detection.
    const existingReport = await prisma.report.findUnique({
      where: {
        reporterId_targetType_targetId: {
          reporterId: userId,
          targetType,
          targetId,
        },
      },
      select: { id: true },
    });

    if (existingReport) {
      return NextResponse.json(
        { error: tReports("duplicate") },
        { status: 409 },
      );
    }

    // Create the report row.
    try {
      await prisma.report.create({
        data: {
          targetType,
          targetId,
          reporterId: userId,
          category,
          description: description ?? null,
        },
      });
    } catch (error) {
      // Concurrent uniq-constraint violations are treated as duplicates.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json(
          { error: tReports("duplicate") },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json(buildCreateReportSuccessPayload(locale), { status: 201 });
  } catch (error) {
    logger.error("[api/reports] Unexpected POST error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
