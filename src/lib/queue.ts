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

export type VerifyJobReasonKey =
  | "serverNotFound"
  | "tokenUpdated"
  | "tokenMissingClaimer"
  | "tokenExpired"
  | "serverOffline"
  | "tokenNotInMotd";

export interface VerifyJobResult {
  success: boolean;
  /**
   * Machine-readable failure key (preferred). The API layer maps it to
   * the recipient's locale via the `errors.api.servers.verify*` namespace.
   */
  reasonKey?: VerifyJobReasonKey;
  /**
   * Legacy / fallback reason text. New callers should set `reasonKey`
   * instead so the API layer can localize the message.
   */
  reason?: string;
}

export function getPingJobId(serverId: string): string {
  return `server-ping-${serverId}`;
}

export function getVerifyJobId(serverId: string, token: string): string {
  return `server-verify-${serverId}-${token}`;
}

let pingQueueInstance: Queue<PingJobData> | null = null;
let verifyQueueInstance: Queue<VerifyJobData> | null = null;
let verifyQueueEventsInstance: QueueEvents | null = null;

export function getPingQueue(): Queue<PingJobData> {
  if (!pingQueueInstance) {
    pingQueueInstance = new Queue<PingJobData>(PING_QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
    });
  }

  return pingQueueInstance;
}

export function getVerifyQueue(): Queue<VerifyJobData> {
  if (!verifyQueueInstance) {
    verifyQueueInstance = new Queue<VerifyJobData>(VERIFY_QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
    });
  }

  return verifyQueueInstance;
}

export function getVerifyQueueEvents(): QueueEvents {
  if (!verifyQueueEventsInstance) {
    verifyQueueEventsInstance = new QueueEvents(VERIFY_QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
    });
  }

  return verifyQueueEventsInstance;
}

export function getQueueConnection() {
  return getRedisConnectionOptions();
}
