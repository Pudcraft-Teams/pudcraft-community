export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { prisma } from "@/lib/db";
import { getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError, translateAdminError } from "@/lib/admin";
import { updateChangelogSchema } from "@/lib/validation";
import { z } from "zod";

const idSchema = z.string().cuid();

/**
 * PATCH /api/admin/changelog/[id] — update a changelog entry.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tAdmin = await getTranslations({ locale, namespace: "errors.api.admin" });
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json(
        { error: translateAdminError(locale, adminResult.errorKey) },
        { status: adminResult.status },
      );
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: tAdmin("changelogInvalidId") }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: tCommon("invalidJson") }, { status: 400 });
    }
    const parsed = updateChangelogSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await prisma.changelog.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: tAdmin("changelogNotFound") }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { ...parsed.data };

    // Handle published-state transitions
    if (parsed.data.published !== undefined) {
      if (parsed.data.published && !existing.published) {
        // Draft → published: stamp publishedAt
        updateData.publishedAt = new Date();
      } else if (!parsed.data.published && existing.published) {
        // Published → draft: clear publishedAt
        updateData.publishedAt = null;
      }
    }

    await prisma.changelog.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[api/admin/changelog] PATCH error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/changelog/[id] — permanently delete a changelog entry.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const locale = await getRequestLocale();
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tAdmin = await getTranslations({ locale, namespace: "errors.api.admin" });
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json(
        { error: translateAdminError(locale, adminResult.errorKey) },
        { status: adminResult.status },
      );
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: tAdmin("changelogInvalidId") }, { status: 400 });
    }

    const existing = await prisma.changelog.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: tAdmin("changelogNotFound") }, { status: 404 });
    }

    await prisma.changelog.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[api/admin/changelog] DELETE error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
