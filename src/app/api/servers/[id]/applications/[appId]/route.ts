export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import { publishWhitelistChange } from "@/lib/whitelist-pubsub";
import { createNotification } from "@/lib/notification";
import { serverLookupIdSchema, serverIdSchema, reviewApplicationSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string; appId: string }>;
}

/**
 * PUT /api/servers/:id/applications/:appId
 * Server owner approves or rejects an application.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    if (!isPrivateServersEnabled()) {
      return NextResponse.json({ error: "该功能未启用" }, { status: 404 });
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
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const parsedAppId = serverIdSchema.safeParse(appId);
    if (!parsedAppId.success) {
      return NextResponse.json({ error: "无效的申请 ID 格式" }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    // Check server ownership
    const server = await prisma.server.findUnique({
      where: { id: cuid },
      select: { id: true, psid: true, name: true, ownerId: true },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    if (server.ownerId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    // Validate request body
    const body = await request.json().catch(() => null);
    const parsed = reviewApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
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
      return NextResponse.json({ error: "申请未找到" }, { status: 404 });
    }

    if (application.status !== "pending") {
      return NextResponse.json({ error: "该申请已被处理" }, { status: 400 });
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
        await createNotification({
          userId: application.userId,
          type: "application_approved",
          title: "入服申请已通过",
          message: `你的「${server.name}」入服申请已通过`,
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
      await createNotification({
        userId: application.userId,
        type: "application_rejected",
        title: "入服申请未通过",
        message: `你的「${server.name}」入服申请未通过${reviewNote ? `：${reviewNote}` : ""}`,
        link: `/servers/${server.psid}`,
        serverId: server.id,
      });
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
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
