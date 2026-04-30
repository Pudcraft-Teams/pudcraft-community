import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { buildMiAuthUrl } from "@/lib/misskey";
import { getRedisConnection } from "@/lib/redis";

export const dynamic = "force-dynamic";

const REDIS_KEY_PREFIX = "miauth:start:";
const TTL_SECONDS = 300;

function sanitizeCallbackUrl(raw: string | null): string {
  if (!raw) {
    return "/";
  }
  // Only allow same-origin paths. Reject absolute URLs and protocol-relative
  // forms ("//evil.com") to prevent open redirects after auth.
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  return "/";
}

export async function GET(request: NextRequest) {
  const callbackUrl = sanitizeCallbackUrl(request.nextUrl.searchParams.get("callbackUrl"));

  let miAuthRedirect: string;
  try {
    const sessionId = randomUUID();
    const ourCallback = `${request.nextUrl.origin}/api/auth/misskey/callback`;

    const redis = getRedisConnection();
    await redis.set(`${REDIS_KEY_PREFIX}${sessionId}`, callbackUrl, "EX", TTL_SECONDS);

    miAuthRedirect = buildMiAuthUrl(sessionId, ourCallback);
  } catch (err) {
    logger.error("misskey miauth start failed", { err: String(err) });
    return NextResponse.redirect(
      new URL(`/login?error=misskey_unconfigured`, request.nextUrl.origin),
      { status: 302 },
    );
  }

  return NextResponse.redirect(miAuthRedirect, { status: 302 });
}
