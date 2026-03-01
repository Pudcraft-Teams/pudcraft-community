import { z } from "zod";

const redisEnvSchema = z.object({
  REDIS_URL: z.string().trim().url("REDIS_URL 必须是合法的 Redis URL").optional(),
  REDIS_HOST: z.string().trim().min(1).optional(),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  REDIS_PASSWORD: z.string().optional(),
});

export interface RedisConfig {
  url: string | null;
  host: string | null;
  port: number;
  password: string | undefined;
}

export function parseRedisConfig(source: NodeJS.ProcessEnv = process.env): RedisConfig {
  const parsed = redisEnvSchema.parse(source);
  const url = parsed.REDIS_URL ?? null;
  const host = parsed.REDIS_HOST ?? null;

  if (!url && !host) {
    throw new Error("Redis 连接配置缺失：请设置 REDIS_URL 或 REDIS_HOST（+ REDIS_PORT）");
  }

  return {
    url,
    host,
    port: parsed.REDIS_PORT ?? 6379,
    password: parsed.REDIS_PASSWORD?.trim() || undefined,
  };
}

export function getRedisConnectionOptions(config: RedisConfig = parseRedisConfig()) {
  if (config.url) {
    const parsed = new URL(config.url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === "rediss:" ? {} : undefined,
    };
  }

  return {
    host: config.host ?? "localhost",
    port: config.port,
    password: config.password,
  };
}
