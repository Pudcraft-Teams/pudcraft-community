export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { prisma } from "@/lib/db";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { authenticatePlugin } from "@/lib/plugin-auth";
import { getRedisConnection } from "@/lib/redis";
import { resolveServerCuid } from "@/lib/lookup";
import { serverLookupIdSchema, statusReportSchema } from "@/lib/validation";

import type { Prisma } from "@prisma/client";

const PLUGIN_CONNECTED_TTL = 60;

/**
 * POST /api/servers/:id/status/report
 * Plugin status report: updates the server's online state, player counts,
 * and related info. Auth via API key (Bearer token).
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

    const body: unknown = await request.json().catch(() => null);
    const parsed = statusReportSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      logger.warn("[api/servers/[id]/status/report] Validation failed", {
        body,
        errors: flattenZodErrorWithLocale(parsed.error, locale),
      });
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: flattenZodErrorWithLocale(parsed.error, locale) },
        { status: 400 },
      );
    }

    const { online, playerCount, maxPlayers, tps, memoryUsed, memoryMax, version } = parsed.data;
    const now = new Date();

    // Build pluginExtra JSON for optional fields
    let pluginExtra: Prisma.InputJsonValue | undefined;
    if (tps !== undefined || memoryUsed !== undefined || memoryMax !== undefined) {
      pluginExtra = {
        ...(tps !== undefined && { tps }),
        ...(memoryUsed !== undefined && { memoryUsed }),
        ...(memoryMax !== undefined && { memoryMax }),
      };
    }

    // Refresh plugin connected status in Redis
    const redis = getRedisConnection();
    await redis.set(`plugin:connected:${cuid}`, "1", "EX", PLUGIN_CONNECTED_TTL);

    // Check previous online status for notification
    const previousStatus = await prisma.server.findUnique({
      where: { id: cuid },
      select: { isOnline: true, name: true, psid: true },
    });

    // Update Server cached fields + create ServerStatus record
    await prisma.$transaction([
      prisma.server.update({
        where: { id: cuid },
        data: {
          isOnline: online,
          playerCount,
          maxPlayers,
          lastPingedAt: now,
          lastPluginReportAt: now,
        },
      }),
      prisma.serverStatus.create({
        data: {
          serverId: cuid,
          online,
          playerCount,
          maxPlayers,
          version: version ?? null,
          pluginExtra: pluginExtra ?? undefined,
          checkedAt: now,
        },
      }),
    ]);

    // Notify favorites on offline → online transition (non-blocking)
    if (!previousStatus?.isOnline && online && previousStatus?.psid) {
      void notifyServerOnline(cuid, previousStatus.name ?? "", previousStatus.psid);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[api/servers/[id]/status/report] Unexpected POST error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * Server-online notification (mirrors the ping-worker logic with a 1-hour
 * cooldown). Side-effect failures are logged only and never block the main
 * operation.
 */
async function notifyServerOnline(
  serverId: string,
  serverName: string,
  serverPsid: number,
): Promise<void> {
  try {
    const { getRedisConnection } = await import("@/lib/redis");
    const redis = getRedisConnection();
    const cooldownKey = `notify-online:${serverId}`;
    const cooldownSet = await redis.set(cooldownKey, "1", "EX", 3600, "NX");

    if (!cooldownSet) return;

    const favorites = await prisma.favorite.findMany({
      where: { serverId },
      select: { userId: true },
    });

    if (favorites.length === 0) return;

    const { createTranslatedBulkNotifications } = await import("@/lib/notification");
    await createTranslatedBulkNotifications(
      favorites.map((f) => ({
        userId: f.userId,
        type: "server_online",
        titleKey: "serverOnlineTitle",
        bodyKey: "serverOnlineBody",
        params: { serverName },
        link: `/servers/${serverPsid}`,
        serverId,
      })),
    );
  } catch (error) {
    logger.error("[status/report] Failed to create server online notifications", {
      serverId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
