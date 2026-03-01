import Redis from "ioredis";
import { getRedisConnectionOptions } from "@/lib/redis-config";

let redis: Redis | undefined;

/**
 * 获取 Redis 连接单例。
 * BullMQ 要求 maxRetriesPerRequest 设为 null。
 */
export function getRedisConnection(): Redis {
  if (!redis) {
    redis = new Redis({
      ...getRedisConnectionOptions(),
      maxRetriesPerRequest: null,
    });
  }
  return redis;
}
