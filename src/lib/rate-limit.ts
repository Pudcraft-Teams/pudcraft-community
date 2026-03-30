import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  degraded?: true;
}

interface InMemoryRateLimitEntry {
  count: number;
  expiresAt: number;
}

const inMemoryRateLimitStore = new Map<string, InMemoryRateLimitEntry>();

export function createRateLimitResult(
  count: number,
  limit: number,
  degraded = false,
): RateLimitResult {
  const result: RateLimitResult = {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
  };

  if (degraded) {
    result.degraded = true;
  }

  return result;
}

function pruneExpiredInMemoryEntries(
  store: Map<string, InMemoryRateLimitEntry>,
  nowMs: number,
): void {
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= nowMs) {
      store.delete(key);
    }
  }
}

export function applyInMemoryRateLimit(
  store: Map<string, InMemoryRateLimitEntry>,
  redisKey: string,
  limit: number,
  windowSeconds: number,
  nowMs = Date.now(),
): RateLimitResult {
  const windowMs = windowSeconds * 1000;
  const expiresAt = (Math.floor(nowMs / windowMs) + 1) * windowMs;
  const existing = store.get(redisKey);
  const count = existing && existing.expiresAt > nowMs ? existing.count + 1 : 1;

  store.set(redisKey, {
    count,
    expiresAt,
  });
  pruneExpiredInMemoryEntries(store, nowMs);

  return createRateLimitResult(count, limit, true);
}

export function createRateLimitFailureResult(
  redisKey: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  return applyInMemoryRateLimit(inMemoryRateLimitStore, redisKey, limit, windowSeconds);
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
    return createRateLimitFailureResult(redisKey, limit, windowSeconds);
  }
}
