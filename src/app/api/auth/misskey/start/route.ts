import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { safeSameOriginCallbackUrl } from "@/lib/auth-callback-url";
import { logger } from "@/lib/logger";
import { buildMiAuthUrl } from "@/lib/misskey";
import { getRedisConnection } from "@/lib/redis";

export const dynamic = "force-dynamic";

const REDIS_KEY_PREFIX = "miauth:start:";
const TTL_SECONDS = 300;
const NONCE_COOKIE_NAME = "miauth_nonce";
const NONCE_COOKIE_PATH = "/api/auth/misskey";

export async function GET(request: NextRequest) {
  const callbackUrl = safeSameOriginCallbackUrl(
    request.nextUrl.searchParams.get("callbackUrl"),
  );

  let miAuthRedirect: string;
  let nonce: string;
  try {
    const sessionId = randomUUID();
    nonce = randomBytes(32).toString("hex");
    const ourCallback = `${request.nextUrl.origin}/api/auth/misskey/callback`;

    const redis = getRedisConnection();
    await redis.set(
      `${REDIS_KEY_PREFIX}${sessionId}`,
      JSON.stringify({ callbackUrl, nonce }),
      "EX",
      TTL_SECONDS,
    );

    miAuthRedirect = buildMiAuthUrl(sessionId, ourCallback);
  } catch (err) {
    logger.error("misskey miauth start failed", { err: String(err) });
    return NextResponse.redirect(
      new URL(`/login?error=misskey_unconfigured`, request.nextUrl.origin),
      { status: 302 },
    );
  }

  // Bind the MiAuth state to the initiating browser. The callback handler
  // requires a matching cookie before it consumes the redis state, which
  // prevents an attacker who minted their own session ID from riding it
  // into a victim's browser (login CSRF / session swapping).
  const response = NextResponse.redirect(miAuthRedirect, { status: 302 });
  response.cookies.set(NONCE_COOKIE_NAME, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TTL_SECONDS,
    path: NONCE_COOKIE_PATH,
  });
  return response;
}
