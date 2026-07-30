export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { authenticatePlugin } from "@/lib/plugin-auth";
import { getRedisConnection } from "@/lib/redis";
import { resolveServerCuid } from "@/lib/lookup";
import { serverLookupIdSchema } from "@/lib/validation";

import type { WhitelistSyncItem } from "@/lib/types";

const PLUGIN_CONNECTED_TTL = 60;

/**
 * POST /api/servers/:id/sync/handshake
 * Plugin handshake: returns full whitelist, pending syncs, and WebSocket URL.
 * Auth via API key (Bearer token).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const authenticated = await authenticatePlugin(request, cuid);
    if (!authenticated) {
      return NextResponse.json({ error: tServers("unauthorized") }, { status: 401 });
    }

    // Fetch full whitelist (all members with mcUsername)
    const members = await prisma.serverMember.findMany({
      where: { serverId: cuid },
      select: { mcUsername: true },
    });

    const whitelist = members
      .map((m) => m.mcUsername)
      .filter((name): name is string => name !== null);

    // Fetch pending/failed sync records
    const pendingSyncs = await prisma.whitelistSync.findMany({
      where: {
        serverId: cuid,
        status: { in: ["pending", "failed"] },
      },
      include: {
        member: { select: { mcUsername: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const syncItems: WhitelistSyncItem[] = pendingSyncs.map((s) => ({
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

    // Set Redis connection status key
    const redis = getRedisConnection();
    await redis.set(`plugin:connected:${cuid}`, "1", "EX", PLUGIN_CONNECTED_TTL);

    // WebSocket URL
    const wsUrl = process.env.WS_PUBLIC_URL || "ws://localhost:3001";

    return NextResponse.json({
      whitelist,
      pendingSyncs: syncItems,
      wsUrl,
    });
  } catch (err) {
    logger.error("[api/servers/[id]/sync/handshake] Unexpected POST error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
