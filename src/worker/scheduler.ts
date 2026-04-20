import { db } from "../lib/db";
import { logger } from "../lib/logger";
import { getPingJobId, getPingQueue } from "../lib/queue";

const PING_INTERVAL_MS = 5 * 60 * 1000;
const PLUGIN_REPORT_SKIP_MS = 2 * 60 * 1000;

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
    const pluginSkipThreshold = new Date(Date.now() - PLUGIN_REPORT_SKIP_MS);

    const servers = await db.server.findMany({
      where: {
        status: "approved",
        OR: [
          { lastPluginReportAt: null },
          { lastPluginReportAt: { lt: pluginSkipThreshold } },
        ],
      },
      select: { id: true, host: true, port: true },
    });

    logger.info("[scheduler] Queueing servers for ping", { count: servers.length });

    const pingQueue = getPingQueue();
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
            jobId: getPingJobId(server.id),
            removeOnComplete: true,
            removeOnFail: true,
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
