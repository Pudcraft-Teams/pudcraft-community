import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { signIn } from "@/lib/auth";
import { issueTicket } from "@/lib/auth-ticket";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  checkMiAuthSession,
  consumeStartedMiAuthSession,
  deriveLocalRoleFromMisskey,
  isLocalMisskeyUser,
  isValidMiAuthSessionId,
} from "@/lib/misskey";
import { getRedisConnection } from "@/lib/redis";

export const dynamic = "force-dynamic";

const NONCE_COOKIE_NAME = "miauth_nonce";
const NONCE_COOKIE_PATH = "/api/auth/misskey";

function clearNonceCookie(response: NextResponse): NextResponse {
  response.cookies.set(NONCE_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: NONCE_COOKIE_PATH,
  });
  return response;
}

function failClosed(origin: string): NextResponse {
  return clearNonceCookie(
    NextResponse.redirect(new URL("/login?error=misskey_failed", origin), { status: 302 }),
  );
}

function nonceMatches(provided: string, stored: string): boolean {
  if (provided.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(stored, "utf8"));
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const sessionId = request.nextUrl.searchParams.get("session");

  if (!isValidMiAuthSessionId(sessionId)) {
    return failClosed(origin);
  }

  const cookieNonce = request.cookies.get(NONCE_COOKIE_NAME)?.value ?? null;
  if (!cookieNonce) {
    logger.warn("misskey callback missing browser-binding cookie", { sessionId });
    return failClosed(origin);
  }

  let callbackUrl: string;
  try {
    const redis = getRedisConnection();
    const consumed = await consumeStartedMiAuthSession(redis, sessionId);
    if (!consumed) {
      // Either expired, replayed, or never minted by our /start route.
      // Fail closed — never sign anyone in for a session we did not mint.
      logger.warn("misskey callback rejected unknown session", { sessionId });
      return failClosed(origin);
    }
    if (!nonceMatches(cookieNonce, consumed.nonce)) {
      // The session ID was minted by /start, but the cookie does not match
      // the nonce stored alongside it — meaning the request reached this
      // endpoint from a different browser than the one that initiated
      // login. Refuse, and burn the consumed redis entry (already gone via
      // GETDEL) so the attacker cannot retry against a fresh victim.
      logger.warn("misskey callback browser-binding nonce mismatch", { sessionId });
      return failClosed(origin);
    }
    callbackUrl = consumed.callbackUrl;
  } catch (err) {
    logger.error("misskey callback redis lookup failed", { err: String(err) });
    return failClosed(origin);
  }

  const checkResult = await checkMiAuthSession(sessionId);
  if (!checkResult) {
    return failClosed(origin);
  }

  const { user: misskeyUser } = checkResult;
  if (!isLocalMisskeyUser(misskeyUser)) {
    logger.warn("misskey callback rejected federated user", {
      sessionId,
      remoteHost: misskeyUser.host,
    });
    return failClosed(origin);
  }

  const role = deriveLocalRoleFromMisskey(misskeyUser);
  const now = new Date();

  let localUser: { id: string; isBanned: boolean };
  try {
    localUser = await db.user.upsert({
      where: { misskeyId: misskeyUser.id },
      update: {
        misskeyUsername: misskeyUser.username,
        name: misskeyUser.name ?? misskeyUser.username,
        image: misskeyUser.avatarUrl,
        bio: misskeyUser.description,
        role,
        lastLoginAt: now,
      },
      create: {
        misskeyId: misskeyUser.id,
        misskeyUsername: misskeyUser.username,
        name: misskeyUser.name ?? misskeyUser.username,
        image: misskeyUser.avatarUrl,
        bio: misskeyUser.description,
        role,
        locale: "zh",
        lastLoginAt: now,
      },
      select: { id: true, isBanned: true },
    });
  } catch (err) {
    logger.error("misskey callback upsert failed", {
      misskeyId: misskeyUser.id,
      err: String(err),
    });
    return failClosed(origin);
  }

  if (localUser.isBanned) {
    return clearNonceCookie(
      NextResponse.redirect(new URL("/login?error=banned", origin), { status: 302 }),
    );
  }

  const ticket = issueTicket(localUser.id);

  // The browser-binding nonce has done its job — burn it before handing off
  // to NextAuth so the success response sent back to the browser also clears
  // the cookie. We use the next/headers store because signIn() throws
  // NEXT_REDIRECT and never returns a NextResponse we could attach to.
  const cookieStore = await cookies();
  cookieStore.set({
    name: NONCE_COOKIE_NAME,
    value: "",
    maxAge: 0,
    path: NONCE_COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  // signIn() throws NEXT_REDIRECT on success, which Next.js converts into a
  // 302 to callbackUrl with the auth cookie set. Do not wrap in try/catch
  // unless filtering for AuthError — redirect errors must propagate.
  await signIn("misskey", { ticket, redirectTo: callbackUrl });

  // Should be unreachable; defensive fallback if signIn ever returns.
  return clearNonceCookie(NextResponse.redirect(new URL(callbackUrl, origin), { status: 302 }));
}
