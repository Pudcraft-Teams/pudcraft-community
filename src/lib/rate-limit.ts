import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/redis";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
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

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
    };
  } catch (error) {
    logger.error("[rate-limit] redis operation failed", error);
    // Redis 异常时降级放行，避免核心流程不可用。
    return { allowed: true, remaining: limit };
  }
}
