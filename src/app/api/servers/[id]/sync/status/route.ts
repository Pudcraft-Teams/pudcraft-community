export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/redis";
import { resolveServerCuid } from "@/lib/lookup";
import { serverLookupIdSchema } from "@/lib/validation";

import type { SyncStatusOverview, WhitelistSyncItem } from "@/lib/types";

/**
 * GET /api/servers/:id/sync/status
 * Returns sync status overview for the server owner's console.
 * Auth via requireActiveUser() + server ownership check.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const server = await prisma.server.findUnique({
      where: { id: cuid },
      select: { id: true, ownerId: true },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    if (!server.ownerId || server.ownerId !== userId) {
      return NextResponse.json({ error: tAuth("forbidden") }, { status: 403 });
    }

    // Count pending and failed syncs
    const [pendingCount, failedCount] = await Promise.all([
      prisma.whitelistSync.count({
        where: { serverId: cuid, status: "pending" },
      }),
      prisma.whitelistSync.count({
        where: { serverId: cuid, status: "failed" },
      }),
    ]);

    // Check plugin connection status via Redis
    const redis = getRedisConnection();
    const connectedKey = await redis.get(`plugin:connected:${cuid}`);
    const connected = connectedKey === "1";

    // Get latest acked sync timestamp
    const latestAcked = await prisma.whitelistSync.findFirst({
      where: { serverId: cuid, status: "acked" },
      orderBy: { ackedAt: "desc" },
      select: { ackedAt: true },
    });

    // Get recent 10 sync records
    const recentSyncs = await prisma.whitelistSync.findMany({
      where: { serverId: cuid },
      include: {
        member: { select: { mcUsername: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const recentSyncItems: WhitelistSyncItem[] = recentSyncs.map((s) => ({
      id: s.id,
      memberId: s.memberId,
      mcUsername: s.member.mcUsername,
      action: s.action as "add" | "remove",
      status: s.status as WhitelistSyncItem["status"],
      retryCount: s.retryCount,
      lastAttemptAt: s.lastAttemptAt?.toISOString() ?? null,
      ackedAt: s.ackedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    }));

    const overview: SyncStatusOverview = {
      connected,
      pendingCount,
      failedCount,
      lastAckedAt: latestAcked?.ackedAt?.toISOString() ?? null,
      recentSyncs: recentSyncItems,
    };

    return NextResponse.json(overview);
  } catch (err) {
    logger.error("[api/servers/[id]/sync/status] Unexpected GET error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
