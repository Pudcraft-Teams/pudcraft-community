import { Worker, type Job } from "bullmq";
import { db } from "../lib/db";
import { pingServer } from "../lib/mc-ping";
import { logger } from "../lib/logger";
import { createTranslatedBulkNotifications } from "../lib/notification";
import { getRedisConnection } from "../lib/redis";
import { getQueueConnection, PING_QUEUE_NAME, type PingJobData } from "../lib/queue";

const ONLINE_NOTIFY_COOLDOWN_SECONDS = 60 * 60;

async function notifyServerOnline(
  serverId: string,
  serverName: string,
  serverPsid: number,
): Promise<void> {
  try {
    const redis = getRedisConnection();
    const cooldownKey = `notify-online:${serverId}`;
    const cooldownSet = await redis.set(
      cooldownKey,
      "1",
      "EX",
      ONLINE_NOTIFY_COOLDOWN_SECONDS,
      "NX",
    );

    if (!cooldownSet) {
      return;
    }

    const favorites = await db.favorite.findMany({
      where: { serverId },
      select: { userId: true },
    });

    if (favorites.length === 0) {
      return;
    }

    await createTranslatedBulkNotifications(
      favorites.map((favorite) => ({
        userId: favorite.userId,
        type: "server_online",
        titleKey: "serverOnlineTitle",
        bodyKey: "serverOnlineBody",
        params: { serverName },
        link: `/servers/${serverPsid}`,
        serverId,
      })),
    );
  } catch (error) {
    logger.error("[worker] Failed to create server online notifications", {
      serverId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Consumes the server-ping queue and persists ping results.
 */
export const pingWorker = new Worker<PingJobData>(
  PING_QUEUE_NAME,
  async (job: Job<PingJobData>) => {
    const { serverId, address, port } = job.data;
    try {
      const previousStatus = await db.server.findUnique({
        where: { id: serverId },
        select: {
          isOnline: true,
          name: true,
          psid: true,
        },
      });

      const result = await pingServer(address, port);

      await db.serverStatus.create({
        data: {
          serverId,
          online: result.isOnline,
          playerCount: result.playerCount,
          maxPlayers: result.maxPlayers,
          version: result.version,
          motd: result.motd,
          error: result.error,
        },
      });

      await db.server.update({
        where: { id: serverId },
        data: {
          isOnline: result.isOnline,
          playerCount: result.playerCount,
          maxPlayers: result.maxPlayers,
          lastPingedAt: new Date(),
        },
      });

      if (!previousStatus?.isOnline && result.isOnline && previousStatus?.psid) {
        await notifyServerOnline(serverId, previousStatus.name ?? address, previousStatus.psid);
      }

      return result;
    } catch (error) {
      logger.error("[ping-worker] Job failed", {
        serverId,
        address,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
  {
    connection: getQueueConnection(),
    concurrency: 5,
  },
);

pingWorker.on("completed", (job) => {
  logger.info("[worker] Ping completed", {
    serverId: job.data.serverId,
    address: job.data.address,
  });
});

pingWorker.on("failed", (job, err) => {
  logger.error("[worker] Ping failed", {
    serverId: job?.data.serverId,
    address: job?.data.address,
    error: err.message,
  });
});

pingWorker.on("error", (err) => {
  logger.error("[worker] Worker error", { error: err.message });
});
