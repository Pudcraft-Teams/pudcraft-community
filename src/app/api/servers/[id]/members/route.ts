export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import { getPublicUrl } from "@/lib/storage";
import type { ServerMemberItem, SyncStatus } from "@/lib/types";
import { serverLookupIdSchema, queryMembersSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/servers/:id/members
 * 获取服务器成员列表（仅服务器 owner 可查看），支持分页。
 */
export async function GET(request: Request, { params }: RouteContext) {
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

    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const serverId = await resolveServerCuid(parsedId.data);
    if (!serverId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, ownerId: true },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    if (!server.ownerId || server.ownerId !== userId) {
      return NextResponse.json({ error: tAuth("forbidden") }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = queryMembersSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    }, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: parsedQuery.error.flatten() },
        { status: 400 },
      );
    }

    const { page, limit } = parsedQuery.data;
    const where = { serverId };

    const [total, members] = await Promise.all([
      prisma.serverMember.count({ where }),
      prisma.serverMember.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          syncs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              status: true,
            },
          },
        },
      }),
    ]);

    const items: ServerMemberItem[] = members.map((member) => ({
      id: member.id,
      userId: member.user.id,
      userName: member.user.name,
      userImage: getPublicUrl(member.user.image),
      mcUsername: member.mcUsername,
      joinedVia: member.joinedVia as "apply" | "invite",
      createdAt: member.createdAt.toISOString(),
      syncStatus: member.syncs.length > 0 ? (member.syncs[0].status as SyncStatus) : null,
    }));

    return NextResponse.json({
      members: items,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    logger.error("[api/servers/[id]/members] Unexpected GET error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
