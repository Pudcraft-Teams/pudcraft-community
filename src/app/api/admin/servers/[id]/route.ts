import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { prisma } from "@/lib/db";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import { createTranslatedNotification } from "@/lib/notification";
import { requireAdmin, isAdminError, translateAdminError } from "@/lib/admin";
import { serverLookupIdSchema, adminServerActionSchema, adminServerPatchSchema } from "@/lib/validation";
import { deleteFile, deleteObject } from "@/lib/storage";

interface ReviewNotificationParams {
  action: "approve" | "reject";
  ownerId: string;
  serverId: string;
  serverPsid: number;
  serverName: string;
  reason?: string;
}

async function createReviewNotification({
  action,
  ownerId,
  serverId,
  serverPsid,
  serverName,
  reason,
}: ReviewNotificationParams): Promise<void> {
  try {
    if (action === "approve") {
      await createTranslatedNotification({
        userId: ownerId,
        type: "server_approved",
        titleKey: "serverApprovedTitle",
        bodyKey: "serverApprovedBody",
        params: { serverName },
        link: `/servers/${serverPsid}`,
        serverId,
      });
      return;
    }

    // Translated body key carries `{reason}`; when the admin skipped the
    // reason we use `serverRejectedBodyFallbackReason` as a placeholder so
    // the final sentence still reads naturally in the recipient's locale.
    const resolvedReason =
      reason ?? (await resolveRejectFallbackReason(ownerId));
    await createTranslatedNotification({
      userId: ownerId,
      type: "server_rejected",
      titleKey: "serverRejectedTitle",
      bodyKey: "serverRejectedBody",
      params: { serverName, reason: resolvedReason },
      link: "/my-servers",
      serverId,
    });
  } catch (error) {
    logger.error("[api/admin/servers/[id]] Failed to create review notification", error);
  }
}

async function resolveRejectFallbackReason(ownerId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { locale: true },
  });
  const locale = user?.locale === "en" ? "en" : "zh";
  const t = await getTranslations({ locale, namespace: "notifications.system" });
  return t("serverRejectedBodyFallbackReason");
}

/**
 * PATCH /api/admin/servers/:id — review a server (approve / reject / mark reviewed).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
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
    const parsedId = serverLookupIdSchema.safeParse(id, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const resolvedId = await resolveServerCuid(parsedId.data);
    if (!resolvedId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: tCommon("invalidJson") }, { status: 400 });
    }

    const hasActionKey =
      typeof body === "object" && body !== null && "action" in (body as Record<string, unknown>);

    // Field-level patch: isVerified toggle or ownerId assignment (no "action" key).
    if (!hasActionKey) {
      const fieldParsed = adminServerPatchSchema.safeParse(body, {
        errorMap: getZodErrorMap(locale),
      });
      if (!fieldParsed.success) {
        return NextResponse.json(
          { error: tCommon("validationFailed"), details: flattenZodErrorWithLocale(fieldParsed.error, locale) },
          { status: 400 },
        );
      }

      const { isVerified, ownerId } = fieldParsed.data;
      const updateData: Record<string, unknown> = {};

      if (isVerified !== undefined) {
        updateData.isVerified = isVerified;
        updateData.verifiedAt = isVerified ? new Date() : null;
      }

      if (ownerId !== undefined) {
        if (ownerId !== null) {
          const ownerExists = await prisma.user.findUnique({
            where: { id: ownerId },
            select: { id: true },
          });
          if (!ownerExists) {
            return NextResponse.json({ error: tAdmin("ownerNotFound") }, { status: 404 });
          }
        }
        updateData.ownerId = ownerId;
      }

      await prisma.server.update({
        where: { id: resolvedId },
        data: updateData,
      });

      const messages: string[] = [];
      if (isVerified !== undefined) messages.push(tAdmin("serverVerifiedSet"));
      if (ownerId !== undefined) messages.push(tAdmin("serverOwnerSet"));

      return NextResponse.json({ success: true, message: messages.join(" ") });
    }

    const parsed = adminServerActionSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: flattenZodErrorWithLocale(parsed.error, locale) },
        { status: 400 },
      );
    }

    const { action, reason } = parsed.data;

    const server = await prisma.server.findUnique({
      where: { id: resolvedId },
      select: { id: true, psid: true, status: true, ownerId: true, name: true },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    if (action === "approve") {
      await prisma.server.update({
        where: { id: server.id },
        data: { status: "approved", rejectReason: null },
      });

      if (server.ownerId) {
        void createReviewNotification({
          action: "approve",
          ownerId: server.ownerId,
          serverId: server.id,
          serverPsid: server.psid,
          serverName: server.name,
        });
      }

      return NextResponse.json({ success: true, message: tAdmin("serverApproved") });
    }

    if (action === "review") {
      await prisma.server.update({
        where: { id: server.id },
        data: {
          reviewStatus: "reviewed",
          reviewedAt: new Date(),
          reviewedBy: adminResult.userId,
        },
      });
      return NextResponse.json({ success: true, message: tAdmin("serverReviewed") });
    }

    if (action === "reject") {
      if (!reason) {
        return NextResponse.json({ error: tAdmin("rejectReasonRequired") }, { status: 400 });
      }

      await prisma.server.update({
        where: { id: server.id },
        data: { status: "rejected", rejectReason: reason },
      });

      if (server.ownerId) {
        void createReviewNotification({
          action: "reject",
          ownerId: server.ownerId,
          serverId: server.id,
          serverPsid: server.psid,
          serverName: server.name,
          reason,
        });
      }

      return NextResponse.json({ success: true, message: tAdmin("serverRejected") });
    }

    return NextResponse.json({ error: tAdmin("unknownAction") }, { status: 400 });
  } catch (err) {
    logger.error("[api/admin/servers/[id]] Unexpected PATCH error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/servers/:id — permanently delete a server.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getRequestLocale();
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
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
    const parsedId = serverLookupIdSchema.safeParse(id, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const resolvedId = await resolveServerCuid(parsedId.data);
    if (!resolvedId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const server = await prisma.server.findUnique({
      where: { id: resolvedId },
      select: {
        id: true,
        iconUrl: true,
        imageUrl: true,
        modpacks: {
          select: { fileKey: true },
        },
      },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.serverNotification.deleteMany({
        where: { serverId: server.id },
      }),
      prisma.server.delete({ where: { id: server.id } }),
    ]);

    if (server.iconUrl) {
      try {
        await deleteFile(server.iconUrl);
      } catch (error) {
        logger.warn("[api/admin/servers/[id]] delete icon failed", error);
      }
    }

    if (server.imageUrl) {
      try {
        await deleteFile(server.imageUrl);
      } catch (error) {
        logger.warn("[api/admin/servers/[id]] delete image failed", error);
      }
    }

    for (const modpack of server.modpacks) {
      try {
        await deleteObject(modpack.fileKey);
      } catch (error) {
        logger.warn("[api/admin/servers/[id]] delete modpack file failed", {
          serverId: server.id,
          fileKey: modpack.fileKey,
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    return NextResponse.json({ success: true, message: tAdmin("serverDeleted") });
  } catch (err) {
    logger.error("[api/admin/servers/[id]] Unexpected DELETE error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
