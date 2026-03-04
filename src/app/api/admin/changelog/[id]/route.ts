export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { updateChangelogSchema } from "@/lib/validation";
import { z } from "zod";

const idSchema = z.string().cuid();

/**
 * PATCH /api/admin/changelog/[id] — 更新更新日志。
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: "无效的 ID" }, { status: 400 });
    }

    const body: unknown = await request.json();
    const parsed = updateChangelogSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await prisma.changelog.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "更新日志不存在" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { ...parsed.data };

    // 处理发布状态变更
    if (parsed.data.published !== undefined) {
      if (parsed.data.published && !existing.published) {
        // 从草稿变为发布：设置发布时间
        updateData.publishedAt = new Date();
      } else if (!parsed.data.published && existing.published) {
        // 从发布变为草稿：清除发布时间
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
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/changelog/[id] — 删除更新日志。
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }

    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: "无效的 ID" }, { status: 400 });
    }

    const existing = await prisma.changelog.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "更新日志不存在" }, { status: 404 });
    }

    await prisma.changelog.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[api/admin/changelog] DELETE error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
