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
