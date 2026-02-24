import Redis from "ioredis";

let redis: Redis | undefined;

/**
 * 获取 Redis 连接单例。
 * BullMQ 要求 maxRetriesPerRequest 设为 null。
 */
export function getRedisConnection(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    redis = new Redis(url, {
      maxRetriesPerRequest: null,
    });
  }
  return redis;
}
