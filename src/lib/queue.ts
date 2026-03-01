import { Queue, QueueEvents } from "bullmq";
import { getRedisConnectionOptions } from "@/lib/redis-config";

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

export function getPingJobId(serverId: string): string {
  return `server-ping:${serverId}`;
}

export function getVerifyJobId(serverId: string, token: string): string {
  return `server-verify:${serverId}:${token}`;
}

export const pingQueue = new Queue<PingJobData>(PING_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
});

export const verifyQueue = new Queue<VerifyJobData>(VERIFY_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
});

export const verifyQueueEvents = new QueueEvents(VERIFY_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
});

export function getQueueConnection() {
  return getRedisConnectionOptions();
}
