import { createHash } from "node:crypto";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { db } from "@/lib/db";
import { verifyAndConsumeTicket } from "@/lib/auth-ticket";
import { getUserImageUrl } from "@/lib/user-image";
import type { NextAuthConfig } from "next-auth";

class BannedUserError extends CredentialsSignin {
  code = "banned";
}

interface SessionTokenStateValidationInput {
  tokenSessionVersion: string | undefined;
  lastLoginAt: Date | null;
  isBanned: boolean;
}

/**
 * The session version is derived from the user's lastLoginAt. Each
 * MiAuth login refreshes lastLoginAt, which invalidates any session
 * that was issued from an earlier login. Admins can also force a
 * logout by simply re-banning the user (isBanned causes invalidation).
 */
export function createLoginSessionVersion(lastLoginAt: Date | null): string {
  const seed = lastLoginAt ? lastLoginAt.toISOString() : "no-login";
  return createHash("sha256").update(seed).digest("hex");
}

export function isSessionTokenStateValid({
  tokenSessionVersion,
  lastLoginAt,
  isBanned,
}: SessionTokenStateValidationInput): boolean {
  if (isBanned) {
    return false;
  }
  if (!tokenSessionVersion) {
    return false;
  }
  return tokenSessionVersion === createLoginSessionVersion(lastLoginAt);
}

function invalidateToken() {
  return null;
}

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      id: "misskey",
      // The login flow only ever sends a single short-lived ticket
      // produced by /api/auth/misskey/callback. The Misskey MiAuth
      // session check, profile sync, and User upsert all happen there;
      // authorize() merely validates and burns the ticket.
      credentials: {
        ticket: { label: "Ticket", type: "text" },
      },
      authorize: async (credentials) => {
        const ticket = typeof credentials?.ticket === "string" ? credentials.ticket : "";
        if (!ticket) {
          return null;
        }
        const userId = await verifyAndConsumeTicket(ticket);
        if (!userId) {
          return null;
        }
        const user = await db.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            image: true,
            isBanned: true,
          },
        });
        if (!user) {
          return null;
        }
        if (user.isBanned) {
          throw new BannedUserError();
        }
        return {
          id: user.id,
          name: user.name,
          image: getUserImageUrl(user.image),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
      }

      if (typeof token.id === "string") {
        const shouldRefreshProfile =
          !!user ||
          trigger === "update" ||
          token.profileHydrated !== true ||
          typeof token.misskeyId !== "string";

        if (!user && !shouldRefreshProfile) {
          const latestSessionState = await db.user.findUnique({
            where: { id: token.id },
            select: {
              lastLoginAt: true,
              isBanned: true,
            },
          });

          if (!latestSessionState) {
            return invalidateToken();
          }

          const tokenStateValid = isSessionTokenStateValid({
            tokenSessionVersion:
              typeof token.sessionVersion === "string" ? token.sessionVersion : undefined,
            lastLoginAt: latestSessionState.lastLoginAt,
            isBanned: latestSessionState.isBanned,
          });

          if (!tokenStateValid) {
            return invalidateToken();
          }
        }

        if (shouldRefreshProfile) {
          const latestUser = await db.user.findUnique({
            where: { id: token.id },
            select: {
              name: true,
              image: true,
              role: true,
              misskeyId: true,
              misskeyUsername: true,
              lastLoginAt: true,
              isBanned: true,
            },
          });

          if (!latestUser) {
            return invalidateToken();
          }

          const nextSessionVersion = createLoginSessionVersion(latestUser.lastLoginAt);
          const tokenStateValid =
            !!user ||
            isSessionTokenStateValid({
              tokenSessionVersion:
                typeof token.sessionVersion === "string" ? token.sessionVersion : undefined,
              lastLoginAt: latestUser.lastLoginAt,
              isBanned: latestUser.isBanned,
            });

          if (!tokenStateValid) {
            return invalidateToken();
          }

          token.name = latestUser.name;
          token.picture = getUserImageUrl(latestUser.image);
          token.role = latestUser.role;
          token.misskeyId = latestUser.misskeyId;
          token.misskeyUsername = latestUser.misskeyUsername;
          token.sessionVersion = nextSessionVersion;
          token.profileHydrated = true;
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      if (session.user) {
        session.user.name = typeof token.name === "string" ? token.name : null;
      }
      if (session.user && (typeof token.picture === "string" || token.picture === null)) {
        session.user.image = token.picture;
      }
      if (session.user) {
        session.user.role = typeof token.role === "string" ? token.role : "user";
      }
      if (session.user && typeof token.misskeyId === "string") {
        session.user.misskeyId = token.misskeyId;
      }
      if (session.user && typeof token.misskeyUsername === "string") {
        session.user.misskeyUsername = token.misskeyUsername;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
