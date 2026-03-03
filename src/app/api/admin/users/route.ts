export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { adminQueryUsersSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";
import { getPublicUrl } from "@/lib/storage";
import type { AdminUserItem } from "@/lib/types";

/**
 * GET /api/admin/users — 管理员获取用户列表。
 */
export async function GET(request: Request) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }

    const { searchParams } = new URL(request.url);
    const parsed = adminQueryUsersSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      banned: searchParams.get("banned") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { page, limit, banned, search } = parsed.data;

    const where: Prisma.UserWhereInput = {};

    if (banned === "banned") {
      where.isBanned = true;
    } else if (banned === "normal") {
      where.isBanned = false;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
          isBanned: true,
          banReason: true,
          bannedAt: true,
          createdAt: true,
          _count: {
            select: {
              servers: true,
              comments: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const data: AdminUserItem[] = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      image: getPublicUrl(user.image),
      role: user.role,
      isBanned: user.isBanned,
      banReason: user.banReason,
      bannedAt: user.bannedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      serverCount: user._count.servers,
      commentCount: user._count.comments,
    }));

    return NextResponse.json({
      data,
      pagination: { page, pageSize: limit, total, totalPages },
    });
  } catch (err) {
    logger.error("[api/admin/users] Unexpected error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
