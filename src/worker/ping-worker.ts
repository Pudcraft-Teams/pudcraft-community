import { Worker, type Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { pingServer } from "../lib/mc-ping";
import { logger } from "../lib/logger";
import { getQueueConnection, PING_QUEUE_NAME, type PingJobData } from "../lib/queue";

const prisma = new PrismaClient();

/**
 * 消费 server-ping 队列并写入状态结果。
 */
export const pingWorker = new Worker<PingJobData>(
  PING_QUEUE_NAME,
  async (job: Job<PingJobData>) => {
    const { serverId, address, port } = job.data;
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

    return result;
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
