import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createNotification } from "@/lib/notification";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { serverIdSchema, adminServerActionSchema } from "@/lib/validation";
import { deleteFile, getObjectKeyFromUrl } from "@/lib/storage";

interface ReviewNotificationParams {
  action: "approve" | "reject";
  ownerId: string;
  serverId: string;
  serverName: string;
  reason?: string;
}

async function createReviewNotification({
  action,
  ownerId,
  serverId,
  serverName,
  reason,
}: ReviewNotificationParams): Promise<void> {
  try {
    if (action === "approve") {
      await createNotification({
        userId: ownerId,
        type: "server_approved",
        title: "服务器审核通过",
        message: `你的服务器「${serverName}」已通过审核，现在所有人都可以看到了`,
        link: `/servers/${serverId}`,
        serverId,
      });
      return;
    }

    await createNotification({
      userId: ownerId,
      type: "server_rejected",
      title: "服务器审核未通过",
      message: `你的服务器「${serverName}」未通过审核：${reason ?? "请联系管理员了解详情"}`,
      link: "/my-servers",
      serverId,
    });
  } catch (error) {
    logger.error("[api/admin/servers/[id]] Failed to create review notification", error);
  }
}

/**
 * PATCH /api/admin/servers/:id — 审核服务器（通过/拒绝）。
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json(
        { error: adminResult.error },
        { status: adminResult.status },
      );
    }

    const { id } = await params;
    const parsedId = serverIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json(
        { error: "无效的服务器 ID 格式" },
        { status: 400 },
      );
    }

    const body: unknown = await request.json();
    const parsed = adminServerActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { action, reason } = parsed.data;

    const server = await prisma.server.findUnique({
      where: { id: parsedId.data },
      select: { id: true, status: true, ownerId: true, name: true },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
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
          serverName: server.name,
        });
      }

      return NextResponse.json({ success: true, message: "服务器已通过审核" });
    }

    if (action === "reject") {
      if (!reason) {
        return NextResponse.json(
          { error: "拒绝时必须填写原因" },
          { status: 400 },
        );
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
          serverName: server.name,
          reason,
        });
      }

      return NextResponse.json({ success: true, message: "服务器已拒绝" });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (err) {
    logger.error("[api/admin/servers/[id]] Unexpected PATCH error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/servers/:id — 删除服务器。
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json(
        { error: adminResult.error },
        { status: adminResult.status },
      );
    }

    const { id } = await params;
    const parsedId = serverIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json(
        { error: "无效的服务器 ID 格式" },
        { status: 400 },
      );
    }

    const server = await prisma.server.findUnique({
      where: { id: parsedId.data },
      select: { id: true, iconUrl: true },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.notification.deleteMany({
        where: { serverId: server.id },
      }),
      prisma.server.delete({ where: { id: server.id } }),
    ]);

    if (server.iconUrl) {
      const key = getObjectKeyFromUrl(server.iconUrl);
      if (key) {
        try {
          await deleteFile(key);
        } catch (error) {
          logger.warn("[api/admin/servers/[id]] delete icon failed", error);
        }
      }
    }

    return NextResponse.json({ success: true, message: "服务器已删除" });
  } catch (err) {
    logger.error("[api/admin/servers/[id]] Unexpected DELETE error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
