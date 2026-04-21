export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import type { ApplicationStatus, MembershipStatus } from "@/lib/types";
import { serverLookupIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/servers/:id/membership
 * 查询当前用户在该服务器的成员身份和申请状态。
 */
export async function GET(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    if (!isPrivateServersEnabled()) {
      return NextResponse.json({ error: tServers("membershipDisabled") }, { status: 404 });
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
      select: { id: true },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const [member, application] = await Promise.all([
      prisma.serverMember.findUnique({
        where: {
          unique_server_member: {
            serverId,
            userId,
          },
        },
        select: { id: true },
      }),
      prisma.serverApplication.findFirst({
        where: {
          serverId,
          userId,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const status: MembershipStatus = {
      isMember: !!member,
      application: application
        ? {
            id: application.id,
            status: application.status as ApplicationStatus,
            createdAt: application.createdAt.toISOString(),
          }
        : null,
    };

    return NextResponse.json(status);
  } catch (error) {
    logger.error("[api/servers/[id]/membership] Unexpected GET error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
