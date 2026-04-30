/**
 * Short-lived, one-shot HMAC tickets used to bridge the Misskey MiAuth
 * callback into NextAuth's Credentials provider.
 *
 * Lifecycle:
 *   1. Misskey callback handler calls issueTicket(userId) and redirects
 *      the browser to NextAuth's /api/auth/callback/misskey?ticket=...
 *   2. NextAuth invokes the Credentials provider's authorize(), which
 *      calls verifyAndConsumeTicket(ticket) once.
 *   3. Redis SETNX on the ticket's jti prevents replay; the ticket is
 *      effectively burned after a single successful verification.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/redis";

const TICKET_TTL_SECONDS = 60;
const REDIS_KEY_PREFIX = "auth:ticket:consumed:";

export interface TicketPayload {
  userId: string;
  iat: number;
  jti: string;
}

function getSecret(): Buffer {
  const raw = process.env.MISSKEY_TICKET_SECRET?.trim();
  if (!raw) {
    throw new Error("MISSKEY_TICKET_SECRET is not configured");
  }
  if (raw.length < 32) {
    throw new Error("MISSKEY_TICKET_SECRET must be at least 32 characters");
  }
  return Buffer.from(raw, "utf8");
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function sign(payloadB64: string): string {
  const mac = createHmac("sha256", getSecret()).update(payloadB64).digest();
  return base64url(mac);
}

export function issueTicket(userId: string): string {
  const payload: TicketPayload = {
    userId,
    iat: Math.floor(Date.now() / 1000),
    jti: randomBytes(16).toString("hex"),
  };
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

/**
 * Verify the ticket signature, expiration, and one-shot consumption.
 * On success returns the userId; on failure returns null and logs the reason.
 *
 * The Redis SETNX guarantees a ticket can be redeemed at most once, even
 * across concurrent NextAuth callbacks.
 */
export async function verifyAndConsumeTicket(ticket: string): Promise<string | null> {
  if (typeof ticket !== "string" || !ticket.includes(".")) {
    return null;
  }
  const [payloadB64, sig] = ticket.split(".", 2);
  if (!payloadB64 || !sig) {
    return null;
  }
  const expected = sign(payloadB64);
  const expectedBuf = Buffer.from(expected, "utf8");
  const sigBuf = Buffer.from(sig, "utf8");
  if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) {
    logger.warn("auth ticket signature mismatch");
    return null;
  }
  let payload: TicketPayload;
  try {
    payload = JSON.parse(fromBase64url(payloadB64).toString("utf8")) as TicketPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.userId !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.jti !== "string"
  ) {
    return null;
  }
  const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
  if (ageSeconds < 0 || ageSeconds > TICKET_TTL_SECONDS) {
    logger.warn("auth ticket expired", { ageSeconds });
    return null;
  }
  const redis = getRedisConnection();
  const key = `${REDIS_KEY_PREFIX}${payload.jti}`;
  const setResult = await redis.set(key, "1", "EX", TICKET_TTL_SECONDS * 2, "NX");
  if (setResult !== "OK") {
    logger.warn("auth ticket replay detected", { jti: payload.jti });
    return null;
  }
  return payload.userId;
}
