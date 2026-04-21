export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { prisma } from "@/lib/db";
import { getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError, translateAdminError } from "@/lib/admin";
import { adminReportActionSchema } from "@/lib/validation";
import { createTranslatedNotification } from "@/lib/notification";

/**
 * PATCH /api/admin/reports/:id — dispose of a report (dismiss / resolve).
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

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) {
      return NextResponse.json({ error: tAdmin("reportNotFound") }, { status: 404 });
    }

    if (report.status !== "pending") {
      return NextResponse.json({ error: tAdmin("reportAlreadyResolved") }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: tCommon("invalidJson") }, { status: 400 });
    }

    const parsed = adminReportActionSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { action, actions, adminNote } = parsed.data;

    const newStatus = action === "dismiss" ? "dismissed" : "resolved";

    await prisma.report.update({
      where: { id },
      data: {
        status: newStatus,
        actions: actions ? JSON.stringify(actions) : null,
        adminNote: adminNote ?? null,
        resolvedBy: adminResult.userId,
        resolvedAt: new Date(),
      },
    });

    // Execute enforcement actions when resolving
    if (action === "resolve" && actions && actions.length > 0) {
      await executeActions(report.targetType, report.targetId, actions, adminNote);
    }

    // Notify reporter (non-blocking)
    try {
      if (action === "dismiss") {
        await createTranslatedNotification({
          userId: report.reporterId,
          type: "report_dismissed",
          titleKey: "reportDismissedTitle",
          bodyKey: "reportDismissedBody",
        });
      } else {
        await createTranslatedNotification({
          userId: report.reporterId,
          type: "report_resolved",
          titleKey: "reportResolvedTitle",
          bodyKey: "reportResolvedBody",
        });
      }
    } catch (error) {
      logger.error("[api/admin/reports/[id]] Failed to notify reporter", error);
    }

    return NextResponse.json({
      success: true,
      message: action === "dismiss" ? tAdmin("reportDismissed") : tAdmin("reportResolved"),
    });
  } catch (err) {
    logger.error("[api/admin/reports/[id]] Unexpected PATCH error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * Execute enforcement actions on the reported target.
 */
async function executeActions(
  targetType: string,
  targetId: string,
  actions: ("warn" | "takedown" | "ban_user")[],
  adminNote?: string | null,
): Promise<void> {
  // Resolve the target owner
  const ownerId = await resolveTargetOwner(targetType, targetId);

  for (const act of actions) {
    try {
      switch (act) {
        case "warn": {
          if (!ownerId) break;
          await createTranslatedNotification({
            userId: ownerId,
            type: "content_warning",
            titleKey: "contentWarningTitle",
            bodyKey: "contentWarningBody",
          });
          break;
        }
        case "takedown": {
          if (targetType === "server") {
            const server = await prisma.server.findUnique({
              where: { id: targetId },
              select: { id: true, ownerId: true, name: true, psid: true },
            });
            if (server) {
              await prisma.server.update({
                where: { id: server.id },
                data: { status: "rejected", rejectReason: "因举报被下架" },
              });
              if (server.ownerId) {
                try {
                  await createTranslatedNotification({
                    userId: server.ownerId,
                    type: "content_takedown",
                    titleKey: "serverTakedownTitle",
                    bodyKey: "serverTakedownBody",
                    params: { serverName: server.name },
                    link: `/servers/${server.psid}`,
                    serverId: server.id,
                  });
                } catch (error) {
                  logger.error("[api/admin/reports/[id]] Failed to notify server owner (takedown)", error);
                }
              }
            }
          } else if (targetType === "comment") {
            const comment = await prisma.serverComment.findUnique({
              where: { id: targetId },
              select: { id: true, authorId: true },
            });
            if (comment) {
              await prisma.serverComment.delete({ where: { id: comment.id } });
              try {
                await createTranslatedNotification({
                  userId: comment.authorId,
                  type: "content_takedown",
                  titleKey: "commentTakedownTitle",
                  bodyKey: "commentTakedownBody",
                });
              } catch (error) {
                logger.error("[api/admin/reports/[id]] Failed to notify comment author (takedown)", error);
              }
            }
          }
          // targetType === "user" — takedown doesn't apply, skip
          break;
        }
        case "ban_user": {
          if (!ownerId) break;
          await prisma.user.update({
            where: { id: ownerId },
            data: { bannedAt: new Date(), isBanned: true, banReason: adminNote ?? "举报处置" },
          });
          break;
        }
      }
    } catch (error) {
      logger.error(`[api/admin/reports/[id]] Failed to execute action: ${act}`, error);
    }
  }
}

/**
 * Resolve the owner/author of a reported target.
 */
async function resolveTargetOwner(targetType: string, targetId: string): Promise<string | null> {
  try {
    if (targetType === "server") {
      const server = await prisma.server.findUnique({
        where: { id: targetId },
        select: { ownerId: true },
      });
      return server?.ownerId ?? null;
    }
    if (targetType === "comment") {
      const comment = await prisma.serverComment.findUnique({
        where: { id: targetId },
        select: { authorId: true },
      });
      return comment?.authorId ?? null;
    }
    if (targetType === "user") {
      return targetId;
    }
    return null;
  } catch (error) {
    logger.error("[api/admin/reports/[id]] Failed to resolve target owner", error);
    return null;
  }
}
