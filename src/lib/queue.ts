import { Queue, QueueEvents } from "bullmq";

export const PING_QUEUE_NAME = "server-ping";
export const VERIFY_QUEUE_NAME = "server-verify";

export interface PingJobData {
  serverId: string;
  address: string;
  port: number;
}

export interface VerifyJobData {
  serverId: string;
  address: string;
  port: number;
  token: string;
}

export interface VerifyJobResult {
  success: boolean;
  reason?: string;
}

function resolveConnection() {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && redisUrl.length > 0) {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === "rediss:" ? {} : undefined,
    };
  }

  return {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

export const pingQueue = new Queue<PingJobData>(PING_QUEUE_NAME, {
  connection: resolveConnection(),
});

export const verifyQueue = new Queue<VerifyJobData>(VERIFY_QUEUE_NAME, {
  connection: resolveConnection(),
});

export const verifyQueueEvents = new QueueEvents(VERIFY_QUEUE_NAME, {
  connection: resolveConnection(),
});

export function getQueueConnection() {
  return resolveConnection();
}
