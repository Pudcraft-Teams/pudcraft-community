// Centralized Zod-validated env wrappers:
//   DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL (security review)
//   Redis connection info (stability review)
import { z } from "zod";
import { parseRedisConfig } from "@/lib/redis-config";

// Core required variables.
// NEXTAUTH_URL can be auto-inferred in NextAuth v5 (Vercel/localhost);
// a self-hosted production deployment must set it explicitly, so the
// schema keeps it optional() to tolerate local builds.
const coreEnvSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid database connection string"),
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 characters"),
  NEXTAUTH_URL: z
    .string()
    .url("NEXTAUTH_URL must be a valid URL (required in production)")
    .optional(),
});

let _coreEnv: z.infer<typeof coreEnvSchema> | null = null;

/**
 * Core auth / database environment variables.
 * Validated lazily to avoid failing the build purely from import side
 * effects.
 */
export function getCoreEnv(): z.infer<typeof coreEnvSchema> {
  if (!_coreEnv) {
    _coreEnv = coreEnvSchema.parse(process.env);
  }

  return _coreEnv;
}

// Redis connection (REDIS_URL or REDIS_HOST + REDIS_PORT — pick one).
let _redisEnv: ReturnType<typeof parseRedisConfig> | null = null;

/** Redis config; validated lazily on first access to avoid build-time failures. */
export function getRedisEnv(): ReturnType<typeof parseRedisConfig> {
  if (!_redisEnv) {
    _redisEnv = parseRedisConfig();
  }

  return _redisEnv;
}

// SMTP mail config.
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

/** SMTP config; validated lazily so modules that don't need SMTP still load. */
export function getSmtpEnv(): z.infer<typeof envSchema> {
  if (!_smtpEnv) {
    _smtpEnv = envSchema.parse(process.env);
  }
  return _smtpEnv;
}

// Content moderation config (Alibaba Cloud Green 2.0).
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

  throw new Error("S3_FORCE_PATH_STYLE must be true/false");
}

// Object storage config (required only when STORAGE_DRIVER=s3).

const objectStorageEnvSchema = z.object({
  STORAGE_DRIVER: z.enum(["local", "s3", "oss"]).default("local"),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_ACCESS_KEY_SECRET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),

  // Legacy variable names; kept to avoid invalidating existing environments.
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
    S3_BUCKET: z.string().min(1, "S3_BUCKET is required when STORAGE_DRIVER=s3"),
    S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID is required when STORAGE_DRIVER=s3"),
    S3_ACCESS_KEY_SECRET: z
      .string()
      .min(1, "S3_ACCESS_KEY_SECRET is required when STORAGE_DRIVER=s3"),
  });
  required.parse(normalizedStorageEnv);

  if (!normalizedStorageEnv.S3_ENDPOINT && !normalizedStorageEnv.S3_REGION) {
    throw new Error("STORAGE_DRIVER=s3 requires S3_ENDPOINT or S3_REGION");
  }
}

export const storageEnv = normalizedStorageEnv;
