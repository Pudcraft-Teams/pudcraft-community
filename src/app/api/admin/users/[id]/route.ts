import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { prisma } from "@/lib/db";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { resolveUserCuid } from "@/lib/lookup";
import { requireAdmin, isAdminError, translateAdminError } from "@/lib/admin";
import { userLookupIdSchema, adminUserActionSchema } from "@/lib/validation";

/**
 * PATCH /api/admin/users/:id — ban / unban a user.
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
    const parsedId = userLookupIdSchema.safeParse(id, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsedId.success) {
      return NextResponse.json({ error: tAdmin("invalidUserIdFormat") }, { status: 400 });
    }

    const resolvedId = await resolveUserCuid(parsedId.data);
    if (!resolvedId) {
      return NextResponse.json({ error: tAdmin("userNotFound") }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: tCommon("invalidJson") }, { status: 400 });
    }
    const parsed = adminUserActionSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: flattenZodErrorWithLocale(parsed.error, locale) },
        { status: 400 },
      );
    }

    const { action, reason } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: resolvedId },
      select: { id: true, role: true, isBanned: true },
    });

    if (!user) {
      return NextResponse.json({ error: tAdmin("userNotFound") }, { status: 404 });
    }

    // Cannot ban admins
    if (action === "ban" && user.role === "admin") {
      return NextResponse.json({ error: tAdmin("cannotBanAdmin") }, { status: 400 });
    }

    if (action === "ban") {
      if (!reason) {
        return NextResponse.json({ error: tAdmin("banReasonRequired") }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          isBanned: true,
          banReason: reason,
          bannedAt: new Date(),
        },
      });

      return NextResponse.json({ success: true, message: tAdmin("userBanned") });
    }

    if (action === "unban") {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isBanned: false,
          banReason: null,
          bannedAt: null,
        },
      });

      return NextResponse.json({ success: true, message: tAdmin("userUnbanned") });
    }

    return NextResponse.json({ error: tAdmin("unknownAction") }, { status: 400 });
  } catch (err) {
    logger.error("[api/admin/users/[id]] Unexpected PATCH error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
