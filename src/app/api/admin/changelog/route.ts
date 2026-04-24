export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { prisma } from "@/lib/db";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError, translateAdminError } from "@/lib/admin";
import { adminQueryChangelogsSchema, createChangelogSchema } from "@/lib/validation";
import type { AdminChangelogItem } from "@/lib/types";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/admin/changelog — admin-only changelog listing (includes drafts).
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
    const parsed = adminQueryChangelogsSchema.safeParse(
      {
        page: searchParams.get("page") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
        published: searchParams.get("published") ?? undefined,
      },
      { errorMap: getZodErrorMap(locale) },
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: flattenZodErrorWithLocale(parsed.error, locale) },
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
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * POST /api/admin/changelog — create a changelog entry.
 */
export async function POST(request: Request) {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: tCommon("invalidJson") }, { status: 400 });
    }
    const parsed = createChangelogSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: flattenZodErrorWithLocale(parsed.error, locale) },
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
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
