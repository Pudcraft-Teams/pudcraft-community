export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { adminQueryServersSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";
import { getPublicUrl } from "@/lib/storage";
import type { AdminServerItem } from "@/lib/types";

type ServerWithOwner = Prisma.ServerGetPayload<{
  include: {
    owner: {
      select: {
        name: true;
        email: true;
      };
    };
  };
}>;

async function findServersWithOwner(
  where: Prisma.ServerWhereInput,
  skip: number,
  take: number,
): Promise<ServerWithOwner[]> {
  if (take <= 0) {
    return [];
  }

  return prisma.server.findMany({
    where,
    skip,
    take,
    orderBy: { createdAt: "desc" },
    include: {
      owner: {
        select: { name: true, email: true },
      },
    },
  });
}

/**
 * GET /api/admin/servers — 管理员获取服务器列表（含所有状态）。
 */
export async function GET(request: Request) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }

    const { searchParams } = new URL(request.url);
    const parsed = adminQueryServersSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { page, limit, status, search } = parsed.data;

    const baseWhere: Prisma.ServerWhereInput = {};
    if (search) {
      baseWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { host: { contains: search, mode: "insensitive" } },
      ];
    }

    const offset = (page - 1) * limit;
    let total = 0;
    let servers: ServerWithOwner[] = [];

    if (status !== "all") {
      const where: Prisma.ServerWhereInput = { ...baseWhere, status };
      [total, servers] = await Promise.all([
        prisma.server.count({ where }),
        findServersWithOwner(where, offset, limit),
      ]);
    } else {
      const pendingWhere: Prisma.ServerWhereInput = {
        ...baseWhere,
        status: "pending",
      };
      const nonPendingWhere: Prisma.ServerWhereInput = {
        ...baseWhere,
        NOT: { status: "pending" },
      };

      const [allTotal, pendingTotal] = await Promise.all([
        prisma.server.count({ where: baseWhere }),
        prisma.server.count({ where: pendingWhere }),
      ]);

      const pendingSkip = Math.min(offset, pendingTotal);
      const pendingTake = Math.max(0, Math.min(limit, pendingTotal - pendingSkip));
      const nonPendingSkip = offset > pendingTotal ? offset - pendingTotal : 0;
      const nonPendingTake = limit - pendingTake;

      const [pendingServers, nonPendingServers] = await Promise.all([
        findServersWithOwner(pendingWhere, pendingSkip, pendingTake),
        findServersWithOwner(nonPendingWhere, nonPendingSkip, nonPendingTake),
      ]);

      total = allTotal;
      servers = [...pendingServers, ...nonPendingServers];
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const data: AdminServerItem[] = servers.map((server) => ({
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port,
      iconUrl: getPublicUrl(server.iconUrl),
      status: server.status,
      rejectReason: server.rejectReason,
      isVerified: server.isVerified,
      ownerId: server.ownerId,
      ownerName: server.owner?.name ?? null,
      ownerEmail: server.owner?.email ?? null,
      createdAt: server.createdAt.toISOString(),
    }));

    return NextResponse.json({
      data,
      pagination: { page, pageSize: limit, total, totalPages },
    });
  } catch (err) {
    logger.error("[api/admin/servers] Unexpected error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
