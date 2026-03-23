export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { createReportSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

/**
 * POST /api/reports
 * 用户提交举报（服务器、评论、用户）。
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    // ── 解析 & 校验请求体 ──
    const body: unknown = await request.json();
    const parsed = createReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "请求参数错误" },
        { status: 400 },
      );
    }

    const { targetType, targetId, category, description } = parsed.data;

    // ── 禁止举报自己 ──
    if (targetType === "user" && targetId === userId) {
      return NextResponse.json({ error: "不能举报自己" }, { status: 400 });
    }

    // ── 验证目标存在 & 禁止举报自己的内容 ──
    if (targetType === "server") {
      const server = await prisma.server.findUnique({
        where: { id: targetId },
        select: { id: true, ownerId: true },
      });
      if (!server) {
        return NextResponse.json({ error: "举报的服务器不存在" }, { status: 404 });
      }
      if (server.ownerId === userId) {
        return NextResponse.json({ error: "不能举报自己的服务器" }, { status: 400 });
      }
    } else if (targetType === "comment") {
      const comment = await prisma.comment.findUnique({
        where: { id: targetId },
        select: { id: true, authorId: true },
      });
      if (!comment) {
        return NextResponse.json({ error: "举报的评论不存在" }, { status: 404 });
      }
      if (comment.authorId === userId) {
        return NextResponse.json({ error: "不能举报自己的评论" }, { status: 400 });
      }
    } else if (targetType === "user") {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!targetUser) {
        return NextResponse.json({ error: "举报的用户不存在" }, { status: 404 });
      }
    }

    // ── 基于信誉的频率限制 ──
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dismissedCount = await prisma.report.count({
      where: {
        reporterId: userId,
        status: "dismissed",
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    let dailyLimit: number;
    if (dismissedCount >= 6) {
      dailyLimit = 1;
    } else if (dismissedCount >= 3) {
      dailyLimit = 3;
    } else {
      dailyLimit = 10;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayReportCount = await prisma.report.count({
      where: {
        reporterId: userId,
        createdAt: { gte: todayStart },
      },
    });

    if (todayReportCount >= dailyLimit) {
      return NextResponse.json(
        { error: "今日举报次数已达上限，请明天再试" },
        { status: 429 },
      );
    }

    // ── 重复举报检测 ──
    const existingReport = await prisma.report.findUnique({
      where: {
        reporterId_targetType_targetId: {
          reporterId: userId,
          targetType,
          targetId,
        },
      },
      select: { id: true },
    });

    if (existingReport) {
      return NextResponse.json(
        { error: "你已经举报过该内容，无需重复提交" },
        { status: 409 },
      );
    }

    // ── 创建举报记录 ──
    try {
      await prisma.report.create({
        data: {
          targetType,
          targetId,
          reporterId: userId,
          category,
          description: description ?? null,
        },
      });
    } catch (error) {
      // 并发场景下唯一约束冲突，按重复举报处理
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json(
          { error: "你已经举报过该内容，无需重复提交" },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json({ message: "举报已提交，感谢你的反馈" }, { status: 201 });
  } catch (error) {
    logger.error("[api/reports] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
