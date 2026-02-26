import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { userIdSchema, adminUserActionSchema } from "@/lib/validation";

/**
 * PATCH /api/admin/users/:id — 封禁/解封用户。
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
    const parsedId = userIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json(
        { error: "无效的用户 ID 格式" },
        { status: 400 },
      );
    }

    const body: unknown = await request.json();
    const parsed = adminUserActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { action, reason } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: parsedId.data },
      select: { id: true, role: true, isBanned: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户未找到" }, { status: 404 });
    }

    // 不能封禁管理员
    if (action === "ban" && user.role === "admin") {
      return NextResponse.json(
        { error: "不能封禁管理员" },
        { status: 400 },
      );
    }

    if (action === "ban") {
      if (!reason) {
        return NextResponse.json(
          { error: "封禁时必须填写原因" },
          { status: 400 },
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          isBanned: true,
          banReason: reason,
          bannedAt: new Date(),
        },
      });

      return NextResponse.json({ success: true, message: "用户已封禁" });
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

      return NextResponse.json({ success: true, message: "用户已解封" });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (err) {
    logger.error("[api/admin/users/[id]] Unexpected PATCH error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
