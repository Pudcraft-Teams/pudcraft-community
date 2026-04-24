import { randomInt } from "crypto";
import { z } from "zod";
import { getRedisConnection } from "@/lib/redis";

// Internal schemas: `parse()` throws on bad input and is only invoked
// with already-sanitized data, so these messages never reach the client.
// Kept as English developer-facing strings.
const codeSchema = z.string().regex(/^\d{6}$/, "verification code must be 6 digits");
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
  .regex(/^[a-z0-9-]+$/i, "invalid key prefix format")
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
 * Generate a 6-digit numeric verification code.
 */
export function generateCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

/**
 * Store a verification code (valid for 10 minutes).
 *
 * @param email - recipient email
 * @param code - 6-digit verification code
 * @param prefix - use-case prefix for the key (defaults to `verify`)
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
 * Check whether the email is currently allowed to request a new code
 * (60-second cooldown).
 *
 * @param email - recipient email
 * @param prefix - use-case prefix (defaults to `verify`)
 * @returns `true` if a new code may be sent; `false` if still cooling down
 */
export async function canSendCode(email: string, prefix = "verify"): Promise<boolean> {
  const validatedEmail = emailSchema.parse(email);
  const validatedPrefix = keyPrefixSchema.parse(prefix);
  const redis = getRedisConnection();
  const exists = await redis.exists(getCooldownKey(validatedEmail, validatedPrefix));
  return exists === 0;
}

/**
 * Set the email send-cooldown flag (60 seconds).
 *
 * @param email - recipient email
 * @param prefix - use-case prefix (defaults to `verify`)
 */
export async function setSendCooldown(email: string, prefix = "verify"): Promise<void> {
  const validatedEmail = emailSchema.parse(email);
  const validatedPrefix = keyPrefixSchema.parse(prefix);
  const redis = getRedisConnection();

  await redis.set(getCooldownKey(validatedEmail, validatedPrefix), "1", "EX", COOLDOWN_TTL_SECONDS);
}

/**
 * Record and check the per-IP daily send quota.
 *
 * @param ip - request IP
 * @returns `true` if under quota; `false` once the daily cap (10) is exceeded
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
 * Record a failed verification attempt (15-minute window).
 *
 * @param email - recipient email
 * @param attemptsPrefix - use-case prefix (defaults to `verify-attempts`)
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
 * Check whether the email is locked out after repeated failed attempts.
 *
 * @param email - recipient email
 * @param attemptsPrefix - use-case prefix (defaults to `verify-attempts`)
 * @returns `true` if locked out; `false` otherwise
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
 * Verify a code; delete it on success (single-use). Failed attempts are
 * counted, and the caller is locked out once the limit is reached.
 *
 * @param email - recipient email
 * @param code - 6-digit verification code
 * @param prefix - use-case prefix (defaults to `verify`)
 * @returns `true` on success; `false` if invalid, expired, or locked
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
