import { NextResponse, type NextRequest } from "next/server";

import { signIn } from "@/lib/auth";
import { issueTicket } from "@/lib/auth-ticket";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { checkMiAuthSession, deriveLocalRoleFromMisskey } from "@/lib/misskey";
import { getRedisConnection } from "@/lib/redis";

export const dynamic = "force-dynamic";

const REDIS_KEY_PREFIX = "miauth:start:";

function safeRedirect(origin: string, target: string): NextResponse {
  return NextResponse.redirect(new URL(target, origin), { status: 302 });
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const sessionId = request.nextUrl.searchParams.get("session");

  if (!sessionId) {
    return safeRedirect(origin, "/login?error=misskey_failed");
  }

  let callbackUrl = "/";
  try {
    const redis = getRedisConnection();
    const stored = await redis.get(`${REDIS_KEY_PREFIX}${sessionId}`);
    if (stored) {
      callbackUrl = stored;
    }
    await redis.del(`${REDIS_KEY_PREFIX}${sessionId}`);
  } catch (err) {
    logger.error("misskey callback redis lookup failed", { err: String(err) });
    return safeRedirect(origin, "/login?error=misskey_failed");
  }

  const checkResult = await checkMiAuthSession(sessionId);
  if (!checkResult) {
    return safeRedirect(origin, "/login?error=misskey_failed");
  }

  const { user: misskeyUser } = checkResult;
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
    return safeRedirect(origin, "/login?error=misskey_failed");
  }

  if (localUser.isBanned) {
    return safeRedirect(origin, "/login?error=banned");
  }

  const ticket = issueTicket(localUser.id);

  // signIn() throws NEXT_REDIRECT on success, which Next.js converts into a
  // 302 to callbackUrl with the auth cookie set. Do not wrap in try/catch
  // unless filtering for AuthError — redirect errors must propagate.
  await signIn("misskey", { ticket, redirectTo: callbackUrl });

  // Should be unreachable; defensive fallback if signIn ever returns.
  return safeRedirect(origin, callbackUrl);
}
