import { Worker, type Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { pingServer } from "../lib/mc-ping";
import { logger } from "../lib/logger";
import { getRedisConnection } from "../lib/redis";
import { getQueueConnection, PING_QUEUE_NAME, type PingJobData } from "../lib/queue";

const prisma = new PrismaClient();
const ONLINE_NOTIFY_COOLDOWN_SECONDS = 60 * 60;

async function notifyServerOnline(serverId: string, serverName: string): Promise<void> {
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

    const favorites = await prisma.favorite.findMany({
      where: { serverId },
      select: { userId: true },
    });

    if (favorites.length === 0) {
      return;
    }

    await prisma.notification.createMany({
      data: favorites.map((favorite) => ({
        userId: favorite.userId,
        type: "server_online",
        title: "服务器已上线",
        message: `你收藏的「${serverName}」已上线`,
        link: `/servers/${serverId}`,
        serverId,
      })),
    });
  } catch (error) {
    logger.error("[worker] Failed to create server online notifications", {
      serverId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * 消费 server-ping 队列并写入状态结果。
 */
export const pingWorker = new Worker<PingJobData>(
  PING_QUEUE_NAME,
  async (job: Job<PingJobData>) => {
    const { serverId, address, port } = job.data;
    try {
      const previousStatus = await prisma.server.findUnique({
        where: { id: serverId },
        select: {
          isOnline: true,
          name: true,
        },
      });

      const result = await pingServer(address, port);

      await prisma.serverStatus.create({
        data: {
          serverId,
          online: result.isOnline,
          playerCount: result.playerCount,
          maxPlayers: result.maxPlayers,
          latencyMs: result.latency,
          version: result.version,
          motd: result.motd,
          error: result.error,
        },
      });

      await prisma.server.update({
        where: { id: serverId },
        data: {
          isOnline: result.isOnline,
          playerCount: result.playerCount,
          maxPlayers: result.maxPlayers,
          latency: result.latency,
          lastPingedAt: new Date(),
        },
      });

      if (!previousStatus?.isOnline && result.isOnline) {
        await notifyServerOnline(serverId, previousStatus?.name ?? address);
      }

      return result;
    } catch (error) {
      console.error("[ping-worker] Job failed", {
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
