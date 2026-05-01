/**
 * Misskey MiAuth wrapper for the self-hosted instance configured via
 * MISSKEY_HOST. Handles the redirect URL construction and the session
 * verification call (POST /api/miauth/{session}/check).
 */

import { logger } from "@/lib/logger";

export interface MisskeyUser {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  isAdmin: boolean;
  isModerator: boolean;
  isBot: boolean;
  host: string | null;
}

const SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reject anything that does not look like the UUID issued by start route.
 * Treating arbitrary strings as session IDs lets an attacker probe MiAuth
 * with values they fully control.
 */
export function isValidMiAuthSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_UUID_RE.test(value);
}

/**
 * The product is bound to a single self-hosted Misskey instance.
 * Federated users (host !== null) are not authoritative for our identity
 * model and must not be allowed to sign in.
 */
export function isLocalMisskeyUser(user: Pick<MisskeyUser, "host">): boolean {
  return user.host === null;
}

/**
 * Minimal Redis surface needed for atomic GET+DEL. We script it via EVAL so
 * the helper works on every Redis ≥ 2.6 — the native `GETDEL` command is
 * Redis 6.2+, and the repo doesn't pin a minimum server version.
 */
interface RedisEval {
  eval(script: string, numKeys: number, ...keys: string[]): Promise<unknown>;
}

/**
 * Atomic GET-then-DEL via Lua. EVAL bodies execute as a single Redis op,
 * so this matches the replay-safety guarantee of the native GETDEL command
 * without needing Redis 6.2+.
 */
const ATOMIC_GETDEL_LUA = `local v = redis.call('GET', KEYS[1])
if v then redis.call('DEL', KEYS[1]) end
return v`;

export interface StartedMiAuthSession {
  callbackUrl: string;
  /** Random nonce minted by /start and mirrored in a HttpOnly cookie on the
   * initiating browser. Callback compares the cookie value against this so
   * an attacker cannot ride a session ID they minted into a victim's browser. */
  nonce: string;
}

/**
 * Atomically consume the start-route redis state. Returns the stored
 * callback URL and browser-binding nonce if (and only if) /start had
 * registered this sessionId. If no state exists, or the stored payload is
 * malformed, the caller MUST fail closed — the sessionId was not minted
 * by us (or the schema drifted), so trusting Misskey's response would let
 * an attacker who approves their own MiAuth session log a victim into
 * their account.
 */
export async function consumeStartedMiAuthSession(
  redis: RedisEval,
  sessionId: string,
): Promise<StartedMiAuthSession | null> {
  const raw = await redis.eval(
    ATOMIC_GETDEL_LUA,
    1,
    `miauth:start:${sessionId}`,
  );
  if (typeof raw !== "string") {
    return null;
  }
  const stored = raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.callbackUrl !== "string" || typeof obj.nonce !== "string") {
    return null;
  }
  if (obj.nonce.length === 0) {
    return null;
  }
  return { callbackUrl: obj.callbackUrl, nonce: obj.nonce };
}

export interface MiAuthCheckResult {
  token: string;
  user: MisskeyUser;
}

export function getMisskeyHost(): string {
  const host = process.env.MISSKEY_HOST?.trim();
  if (!host) {
    throw new Error("MISSKEY_HOST is not configured");
  }
  return host;
}

export function buildMiAuthUrl(sessionId: string, callbackUrl: string): string {
  const host = getMisskeyHost();
  const params = new URLSearchParams({
    name: "Pudcraft Community",
    callback: callbackUrl,
    permission: "",
  });
  return `https://${host}/miauth/${sessionId}?${params.toString()}`;
}

interface RawMiAuthResponse {
  ok?: boolean;
  token?: unknown;
  user?: Record<string, unknown> | null;
}

function coerceMisskeyUser(raw: unknown): MisskeyUser | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || typeof obj.username !== "string") {
    return null;
  }
  return {
    id: obj.id,
    username: obj.username,
    name: typeof obj.name === "string" ? obj.name : null,
    avatarUrl: typeof obj.avatarUrl === "string" ? obj.avatarUrl : null,
    description: typeof obj.description === "string" ? obj.description : null,
    isAdmin: obj.isAdmin === true,
    isModerator: obj.isModerator === true,
    isBot: obj.isBot === true,
    host: typeof obj.host === "string" ? obj.host : null,
  };
}

export async function checkMiAuthSession(sessionId: string): Promise<MiAuthCheckResult | null> {
  const host = getMisskeyHost();
  const url = `https://${host}/api/miauth/${sessionId}/check`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      cache: "no-store",
    });
  } catch (err) {
    logger.error("misskey miauth check fetch failed", { sessionId, err: String(err) });
    return null;
  }
  if (!res.ok) {
    logger.warn("misskey miauth check non-ok status", { sessionId, status: res.status });
    return null;
  }
  let body: RawMiAuthResponse;
  try {
    body = (await res.json()) as RawMiAuthResponse;
  } catch (err) {
    logger.error("misskey miauth check body parse failed", { sessionId, err: String(err) });
    return null;
  }
  if (typeof body.token !== "string" || !body.token) {
    logger.warn("misskey miauth check missing token", { sessionId });
    return null;
  }
  const user = coerceMisskeyUser(body.user);
  if (!user) {
    logger.warn("misskey miauth check missing/invalid user", { sessionId });
    return null;
  }
  return { token: body.token, user };
}

/**
 * Map a Misskey user's privilege flags to the local role string.
 * Decision: instance admins AND moderators map to local "admin".
 */
export function deriveLocalRoleFromMisskey(user: Pick<MisskeyUser, "isAdmin" | "isModerator">): string {
  return user.isAdmin || user.isModerator ? "admin" : "user";
}
