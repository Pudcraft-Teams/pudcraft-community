export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import { publishWhitelistChange } from "@/lib/whitelist-pubsub";
import { createTranslatedNotification } from "@/lib/notification";
import { serverLookupIdSchema, serverIdSchema, reviewApplicationSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string; appId: string }>;
}

/**
 * PUT /api/servers/:id/applications/:appId
 * Server owner approves or rejects an application.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  const tAuth = await getTranslations({ locale, namespace: "errors.api.auth" });
  try {
    if (!isPrivateServersEnabled()) {
      return NextResponse.json({ error: tServers("privateNotEnabled") }, { status: 404 });
    }

    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id, appId } = await params;

    // Validate server ID and appId
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const parsedAppId = serverIdSchema.safeParse(appId);
    if (!parsedAppId.success) {
      return NextResponse.json({ error: tServers("invalidApplicationIdFormat") }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    // Check server ownership
    const server = await prisma.server.findUnique({
      where: { id: cuid },
      select: { id: true, psid: true, name: true, ownerId: true },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    if (server.ownerId !== userId) {
      return NextResponse.json({ error: tAuth("forbidden") }, { status: 403 });
    }

    // Validate request body
    const body = await request.json().catch(() => null);
    const parsed = reviewApplicationSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: flattenZodErrorWithLocale(parsed.error, locale) },
        { status: 400 },
      );
    }

    const { action, reviewNote } = parsed.data;

    // Fetch application and verify it belongs to this server
    const application = await prisma.serverApplication.findUnique({
      where: { id: parsedAppId.data },
      select: {
        id: true,
        serverId: true,
        userId: true,
        status: true,
        formData: true,
      },
    });

    if (!application || application.serverId !== server.id) {
      return NextResponse.json({ error: tServers("applicationNotFound") }, { status: 404 });
    }

    if (application.status !== "pending") {
      return NextResponse.json({ error: tServers("applicationAlreadyProcessed") }, { status: 400 });
    }

    // Extract mcUsername from formData
    const rawFormData = application.formData as Record<string, unknown> | null;
    const mcUsername =
      typeof rawFormData?.mcUsername === "string" ? rawFormData.mcUsername : null;

    if (action === "approve") {
      // Use transaction: update application + create member + create whitelist sync
      const result = await prisma.$transaction(async (tx) => {
        const updatedApp = await tx.serverApplication.update({
          where: { id: application.id },
          data: {
            status: "approved",
            reviewedBy: userId,
            reviewNote: reviewNote ?? null,
          },
        });

        const existingMember = await tx.serverMember.findUnique({
          where: {
            unique_server_member: {
              serverId: server.id,
              userId: application.userId,
            },
          },
          select: {
            id: true,
            mcUsername: true,
          },
        });

        if (existingMember) {
          return { updatedApp, member: existingMember, sync: null };
        }

        const member = await tx.serverMember.create({
          data: {
            serverId: server.id,
            userId: application.userId,
            joinedVia: "apply",
            mcUsername,
          },
        });

        let sync = null;
        if (mcUsername) {
          sync = await tx.whitelistSync.create({
            data: {
              serverId: server.id,
              memberId: member.id,
              action: "add",
              status: "pending",
            },
          });
        }

        return { updatedApp, member, sync };
      });

      // Publish whitelist change outside transaction
      if (result.sync && mcUsername) {
        try {
          await publishWhitelistChange({
            serverId: server.id,
            syncId: result.sync.id,
            action: "add",
            mcUsername,
          });
        } catch (err) {
          logger.warn("[api/servers/[id]/applications/[appId]] publish whitelist change failed", err);
        }
      }

      // Create notification for applicant (fire-and-forget)
      try {
        await createTranslatedNotification({
          userId: application.userId,
          type: "application_approved",
          titleKey: "applicationApprovedTitle",
          bodyKey: "applicationApprovedBody",
          params: { serverName: server.name },
          link: `/servers/${server.psid}`,
          serverId: server.id,
        });
      } catch (err) {
        logger.warn("[api/servers/[id]/applications/[appId]] create approve notification failed", err);
      }

      return NextResponse.json({
        data: {
          id: result.updatedApp.id,
          status: result.updatedApp.status,
          reviewNote: result.updatedApp.reviewNote,
        },
      });
    }

    // action === "reject"
    const updatedApp = await prisma.serverApplication.update({
      where: { id: application.id },
      data: {
        status: "rejected",
        reviewedBy: userId,
        reviewNote: reviewNote ?? null,
      },
    });

    // Create notification for applicant (fire-and-forget)
    try {
      if (reviewNote) {
        await createTranslatedNotification({
          userId: application.userId,
          type: "application_rejected",
          titleKey: "applicationRejectedTitle",
          bodyKey: "applicationRejectedBodyWithReason",
          params: { serverName: server.name, reason: reviewNote },
          link: `/servers/${server.psid}`,
          serverId: server.id,
        });
      } else {
        await createTranslatedNotification({
          userId: application.userId,
          type: "application_rejected",
          titleKey: "applicationRejectedTitle",
          bodyKey: "applicationRejectedBody",
          params: { serverName: server.name },
          link: `/servers/${server.psid}`,
          serverId: server.id,
        });
      }
    } catch (err) {
      logger.warn("[api/servers/[id]/applications/[appId]] create reject notification failed", err);
    }

    return NextResponse.json({
      data: {
        id: updatedApp.id,
        status: updatedApp.status,
        reviewNote: updatedApp.reviewNote,
      },
    });
  } catch (err) {
    logger.error("[api/servers/[id]/applications/[appId]] Unexpected PUT error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
