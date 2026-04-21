export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { logger } from "@/lib/logger";
import { authenticatePlugin } from "@/lib/plugin-auth";
import { resolveServerCuid } from "@/lib/lookup";
import { serverLookupIdSchema } from "@/lib/validation";

import type { WhitelistSyncItem } from "@/lib/types";

/**
 * GET /api/servers/:id/sync/pending
 * Returns all pending or failed WhitelistSync records for this server.
 * Auth via API key (Bearer token).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    if (!isPrivateServersEnabled()) {
      return NextResponse.json({ error: tServers("privateNotEnabled") }, { status: 404 });
    }

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

    return NextResponse.json({ pendingSyncs: syncItems });
  } catch (err) {
    logger.error("[api/servers/[id]/sync/pending] Unexpected GET error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
