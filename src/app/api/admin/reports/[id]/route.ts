export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { adminReportActionSchema } from "@/lib/validation";
import { createNotification } from "@/lib/notification";

/**
 * PATCH /api/admin/reports/:id — 处置举报（驳回/解决）。
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }

    const { id } = await params;

    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) {
      return NextResponse.json({ error: "举报未找到" }, { status: 404 });
    }

    if (report.status !== "pending") {
      return NextResponse.json({ error: "该举报已被处理" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 });
    }

    const parsed = adminReportActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
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
      await createNotification({
        userId: report.reporterId,
        type: action === "dismiss" ? "report_dismissed" : "report_resolved",
        title: action === "dismiss" ? "举报已驳回" : "举报已处理",
        message:
          action === "dismiss"
            ? "你提交的举报经审核后未发现违规行为"
            : "你提交的举报已被管理员处理，感谢你的反馈",
      });
    } catch (error) {
      logger.error("[api/admin/reports/[id]] Failed to notify reporter", error);
    }

    return NextResponse.json({ success: true, message: action === "dismiss" ? "已驳回" : "已处理" });
  } catch (err) {
    logger.error("[api/admin/reports/[id]] Unexpected PATCH error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
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
          await createNotification({
            userId: ownerId,
            type: "content_warning",
            title: "内容违规警告",
            message: "你发布的内容因被举报并经管理员审核，确认存在违规。请注意遵守社区规范，否则可能被进一步处罚。",
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
                  await createNotification({
                    userId: server.ownerId,
                    type: "content_takedown",
                    title: "服务器已被下架",
                    message: `你的服务器「${server.name}」因违规举报已被下架`,
                    link: `/servers/${server.psid}`,
                    serverId: server.id,
                  });
                } catch (error) {
                  logger.error("[api/admin/reports/[id]] Failed to notify server owner (takedown)", error);
                }
              }
            }
          } else if (targetType === "comment") {
            const comment = await prisma.comment.findUnique({
              where: { id: targetId },
              select: { id: true, authorId: true },
            });
            if (comment) {
              await prisma.comment.delete({ where: { id: comment.id } });
              try {
                await createNotification({
                  userId: comment.authorId,
                  type: "content_takedown",
                  title: "评论已被删除",
                  message: "你发布的评论因违规举报已被管理员删除",
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
      const comment = await prisma.comment.findUnique({
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
