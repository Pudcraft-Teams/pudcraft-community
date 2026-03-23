export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { adminUpdateTagSchema } from "@/lib/validation";

const idSchema = z.string().cuid();

/**
 * PUT /api/admin/tags/[id] — 更新话题（名称、显示名称、别名）。
 */
export async function PUT(
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
    const parsed = adminUpdateTagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "话题不存在" }, { status: 404 });
    }

    const updateData: {
      name?: string;
      displayName?: string;
      aliases?: string[];
    } = {};

    if (parsed.data.displayName !== undefined) {
      updateData.displayName = parsed.data.displayName;
    }

    if (parsed.data.aliases !== undefined) {
      updateData.aliases = parsed.data.aliases;
    }

    // If name changes, normalize to lowercase, check uniqueness, add old name to aliases
    if (parsed.data.name !== undefined && parsed.data.name !== existing.name) {
      const newName = parsed.data.name;

      // Check uniqueness
      const conflict = await prisma.tag.findUnique({ where: { name: newName } });
      if (conflict) {
        return NextResponse.json({ error: "该名称已被使用" }, { status: 409 });
      }

      updateData.name = newName;

      // Add old name to aliases automatically
      const currentAliases = updateData.aliases ?? existing.aliases;
      if (!currentAliases.includes(existing.name)) {
        updateData.aliases = [...currentAliases, existing.name];
      }
    }

    const updated = await prisma.tag.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        displayName: updated.displayName,
        aliases: updated.aliases,
        postCount: updated.postCount,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (err) {
    logger.error("[api/admin/tags] PUT error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/tags/[id] — 删除话题及其关联。
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

    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "话题不存在" }, { status: 404 });
    }

    // Delete all PostTag associations first, then delete the Tag
    await prisma.$transaction([
      prisma.postTag.deleteMany({ where: { tagId: id } }),
      prisma.tag.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[api/admin/tags] DELETE error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
