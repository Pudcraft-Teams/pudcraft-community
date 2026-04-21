import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { requireAdmin, isAdminError, translateAdminError } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { adminModerationLogActionSchema } from "@/lib/validation";

/**
 * PATCH /api/admin/moderation/:id — mark a log entry reviewed or add a note.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: tCommon("invalidJson") }, { status: 400 });
    }

    const parsed = adminModerationLogActionSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await prisma.moderationLog.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: tAdmin("moderationLogNotFound") }, { status: 404 });
    }

    const data: { reviewed?: boolean; adminNote?: string } = {};
    if (parsed.data.reviewed !== undefined) {
      data.reviewed = parsed.data.reviewed;
    }
    if (parsed.data.adminNote !== undefined) {
      data.adminNote = parsed.data.adminNote;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: tAdmin("moderationNoFields") }, { status: 400 });
    }

    await prisma.moderationLog.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[api/admin/moderation/[id]] Unexpected PATCH error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
