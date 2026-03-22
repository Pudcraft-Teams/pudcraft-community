export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { authenticatePlugin } from "@/lib/plugin-auth";
import { getRedisConnection } from "@/lib/redis";
import { resolveServerCuid } from "@/lib/lookup";
import { serverLookupIdSchema, statusReportSchema } from "@/lib/validation";

import type { Prisma } from "@prisma/client";

const PLUGIN_CONNECTED_TTL = 60;

/**
 * POST /api/servers/:id/status/report
 * 插件状态上报：更新服务器在线状态、玩家数等信息。
 * Auth via API key (Bearer token).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const authenticated = await authenticatePlugin(request, cuid);
    if (!authenticated) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = statusReportSchema.safeParse(body);
    if (!parsed.success) {
      logger.warn("[api/servers/[id]/status/report] Validation failed", {
        body,
        errors: parsed.error.flatten(),
      });
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
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
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * 服务器上线通知（从 ping-worker 复用逻辑，1 小时冷却）。
 * 副作用失败只记日志，不阻塞主操作。
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

    await prisma.serverNotification.createMany({
      data: favorites.map((f) => ({
        userId: f.userId,
        type: "server_online",
        title: "服务器已上线",
        message: `你收藏的「${serverName}」已上线`,
        link: `/servers/${serverPsid}`,
        serverId,
      })),
    });
  } catch (error) {
    logger.error("[status/report] Failed to create server online notifications", {
      serverId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
