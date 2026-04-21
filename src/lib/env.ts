// Fix: env.ts - 补全关键环境变量的 Zod 校验：
//   DATABASE_URL、NEXTAUTH_SECRET、NEXTAUTH_URL（env.ts:1 - 安全审查）
//   Redis 连接信息（env.ts:1 - 稳定性审查）
import { z } from "zod";
import { parseRedisConfig } from "@/lib/redis-config";

// ─── 核心必填变量 ─────────────────────────────────────
// NEXTAUTH_URL 在 NextAuth v5 中可被自动推断（Vercel/localhost），
// 生产自托管时必须显式设置；此处 optional() 以兼容本地构建。
const coreEnvSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL 必须是合法的数据库连接字符串"),
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET 长度不能少于 16 字符"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL 必须是合法的 URL（生产环境必填）").optional(),
});

let _coreEnv: z.infer<typeof coreEnvSchema> | null = null;

/**
 * 核心认证 / 数据库环境变量。
 * 延迟到真正需要时再校验，避免构建期仅因 import 侧链触发而提前失败。
 */
export function getCoreEnv(): z.infer<typeof coreEnvSchema> {
  if (!_coreEnv) {
    _coreEnv = coreEnvSchema.parse(process.env);
  }

  return _coreEnv;
}

// ─── Redis 连接（REDIS_URL 或 REDIS_HOST + REDIS_PORT 二选一） ───
let _redisEnv: ReturnType<typeof parseRedisConfig> | null = null;

/** Redis 配置，首次访问时才校验，避免构建期仅因 import 侧链而提前失败。 */
export function getRedisEnv(): ReturnType<typeof parseRedisConfig> {
  if (!_redisEnv) {
    _redisEnv = parseRedisConfig();
  }

  return _redisEnv;
}

// ─── SMTP 邮件配置 ─────────────────────────────────────
const envSchema = z.object({
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().email(),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().min(1),
});

let _smtpEnv: z.infer<typeof envSchema> | null = null;

/** SMTP 配置，首次访问时才校验（避免不需要 SMTP 的模块因缺少环境变量而崩溃） */
export function getSmtpEnv(): z.infer<typeof envSchema> {
  if (!_smtpEnv) {
    _smtpEnv = envSchema.parse(process.env);
  }
  return _smtpEnv;
}

// ─── 内容审查配置（阿里云内容安全 Green 2.0） ─────────
const contentModerationEnvSchema = z.object({
  CONTENT_MODERATION_ACCESS_KEY_ID: z.string().min(1).optional(),
  CONTENT_MODERATION_ACCESS_KEY_SECRET: z.string().min(1).optional(),
  CONTENT_MODERATION_ENDPOINT: z
    .string()
    .optional()
    .default("green-cip.cn-shenzhen.aliyuncs.com"),
  CONTENT_MODERATION_ENABLED: z.string().optional().default("true"),
});

const _cmParsed = contentModerationEnvSchema.safeParse(process.env);
const _cmRaw = _cmParsed.success ? _cmParsed.data : null;
const _cmKeyId = _cmRaw?.CONTENT_MODERATION_ACCESS_KEY_ID ?? "";
const _cmKeySecret = _cmRaw?.CONTENT_MODERATION_ACCESS_KEY_SECRET ?? "";

export const contentModerationEnv = {
  accessKeyId: _cmKeyId,
  accessKeySecret: _cmKeySecret,
  endpoint: _cmRaw?.CONTENT_MODERATION_ENDPOINT ?? "green-cip.cn-shenzhen.aliyuncs.com",
  enabled: Boolean(
    _cmRaw && _cmRaw.CONTENT_MODERATION_ENABLED === "true" && _cmKeyId && _cmKeySecret,
  ),
};

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error("S3_FORCE_PATH_STYLE 必须是 true/false");
}

// ─── 对象存储配置（仅 STORAGE_DRIVER=s3 时必填） ─────

const objectStorageEnvSchema = z.object({
  STORAGE_DRIVER: z.enum(["local", "s3", "oss"]).default("local"),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_ACCESS_KEY_SECRET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),

  // 兼容旧变量名，避免已有环境一次性失效
  OSS_REGION: z.string().optional(),
  OSS_BUCKET: z.string().optional(),
  OSS_ACCESS_KEY_ID: z.string().optional(),
  OSS_ACCESS_KEY_SECRET: z.string().optional(),
  OSS_ENDPOINT: z.string().optional(),
  OSS_PUBLIC_BASE_URL: z.string().optional(),
  OSS_FORCE_PATH_STYLE: z.string().optional(),
});

const parsedObjectStorage = objectStorageEnvSchema.parse(process.env);

const normalizedStorageEnv = {
  STORAGE_DRIVER:
    parsedObjectStorage.STORAGE_DRIVER === "oss" ? "s3" : parsedObjectStorage.STORAGE_DRIVER,
  S3_REGION: parsedObjectStorage.S3_REGION ?? parsedObjectStorage.OSS_REGION,
  S3_BUCKET: parsedObjectStorage.S3_BUCKET ?? parsedObjectStorage.OSS_BUCKET,
  S3_ACCESS_KEY_ID: parsedObjectStorage.S3_ACCESS_KEY_ID ?? parsedObjectStorage.OSS_ACCESS_KEY_ID,
  S3_ACCESS_KEY_SECRET:
    parsedObjectStorage.S3_ACCESS_KEY_SECRET ?? parsedObjectStorage.OSS_ACCESS_KEY_SECRET,
  S3_ENDPOINT: parsedObjectStorage.S3_ENDPOINT ?? parsedObjectStorage.OSS_ENDPOINT,
  S3_PUBLIC_BASE_URL:
    parsedObjectStorage.S3_PUBLIC_BASE_URL ?? parsedObjectStorage.OSS_PUBLIC_BASE_URL,
  S3_FORCE_PATH_STYLE: parseBooleanEnv(
    parsedObjectStorage.S3_FORCE_PATH_STYLE ?? parsedObjectStorage.OSS_FORCE_PATH_STYLE,
  ),
} as const;

if (normalizedStorageEnv.STORAGE_DRIVER === "s3") {
  const required = z.object({
    S3_BUCKET: z.string().min(1, "STORAGE_DRIVER=s3 时必须配置 S3_BUCKET"),
    S3_ACCESS_KEY_ID: z.string().min(1, "STORAGE_DRIVER=s3 时必须配置 S3_ACCESS_KEY_ID"),
    S3_ACCESS_KEY_SECRET: z.string().min(1, "STORAGE_DRIVER=s3 时必须配置 S3_ACCESS_KEY_SECRET"),
  });
  required.parse(normalizedStorageEnv);

  if (!normalizedStorageEnv.S3_ENDPOINT && !normalizedStorageEnv.S3_REGION) {
    throw new Error("STORAGE_DRIVER=s3 时必须配置 S3_ENDPOINT 或 S3_REGION");
  }
}

export const storageEnv = normalizedStorageEnv;
