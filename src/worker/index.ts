import { logger } from "../lib/logger";
import { pingWorker } from "./ping-worker";
import { startScheduler } from "./scheduler";
import { verifyWorker } from "./verify-worker";

const timer = startScheduler();

logger.info("[worker] All workers started");

const shutdown = async () => {
  logger.info("[worker] Shutting down...");
  clearInterval(timer);
  await pingWorker.close();
  await verifyWorker.close();
  process.exit(0);
};

process.on("SIGTERM", () => {
  void shutdown();
});

process.on("SIGINT", () => {
  void shutdown();
});
