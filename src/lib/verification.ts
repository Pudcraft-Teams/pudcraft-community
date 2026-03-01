import { randomInt } from "crypto";
import { z } from "zod";
import { getRedisConnection } from "@/lib/redis";

const codeSchema = z.string().regex(/^\d{6}$/, "验证码必须是 6 位数字");
const emailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());
const ipSchema = z.string().trim().min(1).max(64);
const keyPrefixSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9-]+$/i, "前缀格式不合法")
  .transform((value) => value.toLowerCase());

const CODE_TTL_SECONDS = 600;
const COOLDOWN_TTL_SECONDS = 60;
const IP_LIMIT_TTL_SECONDS = 86_400;
const FAILED_ATTEMPT_TTL_SECONDS = 900;
const MAX_IP_SENDS_PER_DAY = 10;
const MAX_FAILED_ATTEMPTS = 5;

function getCodeKey(email: string, prefix: string): string {
  return `${prefix}:${email}`;
}

function getCooldownKey(email: string, prefix: string): string {
  return `${prefix}-cooldown:${email}`;
}

function getIpLimitKey(ip: string): string {
  const dateKey = new Date().toISOString().slice(0, 10);
  return `verify-ip:${ip}:${dateKey}`;
}

function getFailedAttemptsKey(email: string, attemptsPrefix: string): string {
  return `${attemptsPrefix}:${email}`;
}

/**
 * 生成 6 位数字验证码。
 */
export function generateCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

/**
 * 存储验证码（有效期 10 分钟）。
 *
 * @param email - 邮箱
 * @param code - 6 位验证码
 * @param prefix - 验证码用途前缀（默认 `verify`）
 */
export async function storeCode(email: string, code: string, prefix = "verify"): Promise<void> {
  const validatedEmail = emailSchema.parse(email);
  const validatedCode = codeSchema.parse(code);
  const validatedPrefix = keyPrefixSchema.parse(prefix);
  const redis = getRedisConnection();

  await redis.set(
    getCodeKey(validatedEmail, validatedPrefix),
    validatedCode,
    "EX",
    CODE_TTL_SECONDS,
  );
}

/**
 * 检查当前邮箱是否可以发送验证码（冷却 60 秒）。
 *
 * @param email - 邮箱
 * @param prefix - 验证码用途前缀（默认 `verify`）
 * @returns `true` 可发送；`false` 冷却中
 */
export async function canSendCode(email: string, prefix = "verify"): Promise<boolean> {
  const validatedEmail = emailSchema.parse(email);
  const validatedPrefix = keyPrefixSchema.parse(prefix);
  const redis = getRedisConnection();
  const exists = await redis.exists(getCooldownKey(validatedEmail, validatedPrefix));
  return exists === 0;
}

/**
 * 设置邮箱发送冷却（60 秒）。
 *
 * @param email - 邮箱
 * @param prefix - 验证码用途前缀（默认 `verify`）
 */
export async function setSendCooldown(email: string, prefix = "verify"): Promise<void> {
  const validatedEmail = emailSchema.parse(email);
  const validatedPrefix = keyPrefixSchema.parse(prefix);
  const redis = getRedisConnection();

  await redis.set(getCooldownKey(validatedEmail, validatedPrefix), "1", "EX", COOLDOWN_TTL_SECONDS);
}

/**
 * 记录并检查 IP 每日发送上限。
 *
 * @param ip - 请求 IP
 * @returns `true` 未超限；`false` 已超过每日 10 次
 */
export async function checkIpLimit(ip: string): Promise<boolean> {
  const validatedIp = ipSchema.parse(ip);
  const redis = getRedisConnection();
  const key = getIpLimitKey(validatedIp);

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, IP_LIMIT_TTL_SECONDS);
  }

  return count <= MAX_IP_SENDS_PER_DAY;
}

/**
 * 记录验证码验证失败次数（15 分钟窗口）。
 *
 * @param email - 邮箱
 * @param attemptsPrefix - 失败次数用途前缀（默认 `verify-attempts`）
 */
export async function recordFailedAttempt(
  email: string,
  attemptsPrefix = "verify-attempts",
): Promise<void> {
  const validatedEmail = emailSchema.parse(email);
  const validatedAttemptsPrefix = keyPrefixSchema.parse(attemptsPrefix);
  const redis = getRedisConnection();
  const key = getFailedAttemptsKey(validatedEmail, validatedAttemptsPrefix);

  const attempts = await redis.incr(key);
  if (attempts === 1) {
    await redis.expire(key, FAILED_ATTEMPT_TTL_SECONDS);
  }
}

/**
 * 检查邮箱是否已被验证码错误次数锁定。
 *
 * @param email - 邮箱
 * @param attemptsPrefix - 失败次数用途前缀（默认 `verify-attempts`）
 * @returns `true` 已锁定；`false` 未锁定
 */
export async function isLocked(
  email: string,
  attemptsPrefix = "verify-attempts",
): Promise<boolean> {
  const validatedEmail = emailSchema.parse(email);
  const validatedAttemptsPrefix = keyPrefixSchema.parse(attemptsPrefix);
  const redis = getRedisConnection();
  const rawAttempts = await redis.get(
    getFailedAttemptsKey(validatedEmail, validatedAttemptsPrefix),
  );
  const attempts = rawAttempts ? Number(rawAttempts) : 0;

  return attempts >= MAX_FAILED_ATTEMPTS;
}

/**
 * 校验验证码，成功后一次性删除。
 * 校验失败会累计次数，超过上限将锁定。
 *
 * @param email - 邮箱
 * @param code - 6 位验证码
 * @param prefix - 验证码用途前缀（默认 `verify`）
 * @returns `true` 校验成功；`false` 校验失败或已锁定
 */
export async function verifyCode(email: string, code: string, prefix = "verify"): Promise<boolean> {
  const validatedEmail = emailSchema.parse(email);
  const validatedCode = codeSchema.parse(code);
  const validatedPrefix = keyPrefixSchema.parse(prefix);
  const attemptsPrefix = `${validatedPrefix}-attempts`;
  const redis = getRedisConnection();

  if (await isLocked(validatedEmail, attemptsPrefix)) {
    return false;
  }

  const key = getCodeKey(validatedEmail, validatedPrefix);
  const storedCode = await redis.get(key);

  if (!storedCode || storedCode !== validatedCode) {
    await recordFailedAttempt(validatedEmail, attemptsPrefix);
    return false;
  }

  await Promise.all([
    redis.del(key),
    redis.del(getFailedAttemptsKey(validatedEmail, attemptsPrefix)),
  ]);
  return true;
}
