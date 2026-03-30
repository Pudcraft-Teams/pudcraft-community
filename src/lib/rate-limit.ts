import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/redis";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export function createRateLimitResult(count: number, limit: number): RateLimitResult {
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
  };
}

export function createRateLimitFailureResult(_limit: number): RateLimitResult {
  return {
    allowed: false,
    remaining: 0,
  };
}

/**
 * Redis 固定窗口限流。
 * key 建议格式：`{action}:{identifier}`，函数内部会统一加 `rl:` 前缀。
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (limit <= 0 || windowSeconds <= 0) {
    return { allowed: false, remaining: 0 };
  }

  const redis = getRedisConnection();
  const nowBucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const redisKey = `rl:${key}:${nowBucket}`;

  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    return createRateLimitResult(count, limit);
  } catch (error) {
    logger.error("[rate-limit] redis operation failed", error);
    return createRateLimitFailureResult(limit);
  }
}
