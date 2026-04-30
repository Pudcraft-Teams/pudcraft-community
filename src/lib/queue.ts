import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "@/lib/redis-config";

export const PING_QUEUE_NAME = "server-ping";

export interface PingJobData {
  serverId: string;
  address: string;
  port: number;
}

export function getPingJobId(serverId: string): string {
  return `server-ping-${serverId}`;
}

let pingQueueInstance: Queue<PingJobData> | null = null;

export function getPingQueue(): Queue<PingJobData> {
  if (!pingQueueInstance) {
    pingQueueInstance = new Queue<PingJobData>(PING_QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
    });
  }

  return pingQueueInstance;
}

export function getQueueConnection() {
  return getRedisConnectionOptions();
}
