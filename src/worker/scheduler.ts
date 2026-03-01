import { PrismaClient } from "@prisma/client";
import { logger } from "../lib/logger";
import { pingQueue } from "../lib/queue";

const prisma = new PrismaClient();
const PING_INTERVAL_MS = 5 * 60 * 1000;

let isScheduling = false;

/**
 * 扫描所有服务器并加入 ping 队列。
 */
export async function scheduleAllPings(): Promise<void> {
  if (isScheduling) {
    logger.warn("[scheduler] Previous scheduling is still running, skip this round");
    return;
  }

  isScheduling = true;
  try {
    const servers = await prisma.server.findMany({
      where: { status: "approved" },
      select: { id: true, host: true, port: true },
    });

    logger.info("[scheduler] Queueing servers for ping", { count: servers.length });

    await Promise.all(
      servers.map((server) =>
        pingQueue.add(
          `ping-${server.id}`,
          {
            serverId: server.id,
            address: server.host,
            port: server.port,
          },
          {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 1,
          },
        ),
      ),
    );
  } catch (error) {
    logger.error("[scheduler] Failed to schedule ping jobs", {
      error: error instanceof Error ? error.message : "unknown",
    });
  } finally {
    isScheduling = false;
  }
}

export function startScheduler(): NodeJS.Timeout {
  void scheduleAllPings();
  logger.info("[scheduler] Started, pinging every 5 minutes");
  return setInterval(() => {
    void scheduleAllPings();
  }, PING_INTERVAL_MS);
}
