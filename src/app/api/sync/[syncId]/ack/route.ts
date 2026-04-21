export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { logger } from "@/lib/logger";
import { hashApiKey } from "@/lib/api-key";
import { serverIdSchema } from "@/lib/validation";

/**
 * POST /api/sync/:syncId/ack
 * Acknowledge a whitelist sync record.
 * Auth via API key — extract serverId from the sync record, then validate.
 */
export async function POST(request: Request, { params }: { params: Promise<{ syncId: string }> }) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    if (!isPrivateServersEnabled()) {
      return NextResponse.json({ error: tServers("privateNotEnabled") }, { status: 404 });
    }

    const { syncId } = await params;

    const parsedSyncId = serverIdSchema.safeParse(syncId);
    if (!parsedSyncId.success) {
      return NextResponse.json({ error: tServers("invalidSyncIdFormat") }, { status: 400 });
    }

    // Find the sync record to get the serverId
    const sync = await prisma.whitelistSync.findUnique({
      where: { id: parsedSyncId.data },
      select: { id: true, serverId: true, status: true },
    });

    if (!sync) {
      return NextResponse.json({ error: tServers("syncRecordNotFound") }, { status: 404 });
    }

    // Authenticate via API key against the server
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: tServers("unauthorized") }, { status: 401 });
    }

    const raw = authHeader.slice(7);
    const hash = hashApiKey(raw);

    const server = await prisma.server.findUnique({
      where: { id: sync.serverId },
      select: { apiKeyHash: true },
    });

    if (!server?.apiKeyHash || server.apiKeyHash !== hash) {
      return NextResponse.json({ error: tServers("unauthorized") }, { status: 401 });
    }

    // Update the sync record
    await prisma.whitelistSync.update({
      where: { id: sync.id },
      data: {
        status: "acked",
        ackedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[api/sync/[syncId]/ack] Unexpected POST error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
