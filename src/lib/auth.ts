import { createHash } from "node:crypto";
import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit } from "@/lib/rate-limit";
import { getPublicUrl } from "@/lib/storage";
import { loginSchema } from "@/lib/validation";

const BCRYPT_ROUNDS = 12;

class BannedUserError extends CredentialsSignin {
  code = "banned";
}

interface SessionTokenStateValidationInput {
  tokenSessionVersion: string | undefined;
  latestPasswordHash: string;
  isBanned: boolean;
}

export function createPasswordSessionVersion(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex");
}

export function isSessionTokenStateValid({
  tokenSessionVersion,
  latestPasswordHash,
  isBanned,
}: SessionTokenStateValidationInput): boolean {
  if (isBanned) {
    return false;
  }

  if (!tokenSessionVersion) {
    return false;
  }

  return tokenSessionVersion === createPasswordSessionVersion(latestPasswordHash);
}

function invalidateToken<T extends Record<string, unknown>>(token: T): T {
  return {
    ...token,
    id: undefined,
    name: undefined,
    email: undefined,
    picture: undefined,
    role: undefined,
    uid: undefined,
    profileHydrated: false,
    sessionVersion: undefined,
    invalidated: true,
  };
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      authorize: async (credentials, request) => {
        const clientIp = getClientIp(request);
        const loginRate = await rateLimit(`login:${clientIp}`, 10, 15 * 60);
        if (!loginRate.allowed) {
          const rawPassword = typeof credentials?.password === "string" ? credentials.password : "";
          await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
          return null;
        }

        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;
        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            emailVerified: true,
            passwordHash: true,
            isBanned: true,
          },
        });

        if (!user) {
          await bcrypt.hash(password, BCRYPT_ROUNDS);
          return null;
        }

        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) {
          return null;
        }

        if (!user.emailVerified) {
          return null;
        }

        if (user.isBanned) {
          throw new BannedUserError();
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: getPublicUrl(user.image),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
      }

      if (typeof token.id === "string") {
        const shouldRefreshProfile =
          !!user || trigger === "update" || token.profileHydrated !== true || typeof token.uid !== "number";

        if (!user && !shouldRefreshProfile) {
          const latestSessionState = await db.user.findUnique({
            where: { id: token.id },
            select: {
              passwordHash: true,
              isBanned: true,
            },
          });

          if (!latestSessionState) {
            return invalidateToken(token);
          }

          const tokenStateValid = isSessionTokenStateValid({
            tokenSessionVersion:
              typeof token.sessionVersion === "string" ? token.sessionVersion : undefined,
            latestPasswordHash: latestSessionState.passwordHash,
            isBanned: latestSessionState.isBanned,
          });

          if (!tokenStateValid) {
            return invalidateToken(token);
          }
        }

        if (shouldRefreshProfile) {
          const latestUser = await db.user.findUnique({
            where: { id: token.id },
            select: {
              name: true,
              email: true,
              image: true,
              role: true,
              uid: true,
              passwordHash: true,
              isBanned: true,
            },
          });

          if (!latestUser) {
            return invalidateToken(token);
          }

          const nextSessionVersion = createPasswordSessionVersion(latestUser.passwordHash);
          const tokenStateValid =
            !!user ||
            isSessionTokenStateValid({
              tokenSessionVersion:
                typeof token.sessionVersion === "string" ? token.sessionVersion : undefined,
              latestPasswordHash: latestUser.passwordHash,
              isBanned: latestUser.isBanned,
            });

          if (!tokenStateValid) {
            return invalidateToken(token);
          }

          token.name = latestUser.name;
          token.email = latestUser.email;
          token.picture = getPublicUrl(latestUser.image);
          token.role = latestUser.role;
          token.uid = latestUser.uid;
          token.sessionVersion = nextSessionVersion;
          token.invalidated = false;
          token.profileHydrated = true;
        }
      }

      if (trigger === "update" && session) {
        if ("name" in session && (typeof session.name === "string" || session.name === null)) {
          token.name = session.name;
        }
        if ("image" in session && (typeof session.image === "string" || session.image === null)) {
          token.picture = session.image;
        }
      }

      return token;
    },
    session({ session, token }) {
      if (token.invalidated === true) {
        return {
          ...session,
          user: undefined,
        };
      }

      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      if (session.user) {
        session.user.name = typeof token.name === "string" ? token.name : null;
      }
      if (session.user && typeof token.email === "string") {
        session.user.email = token.email;
      }
      if (session.user && (typeof token.picture === "string" || token.picture === null)) {
        session.user.image = token.picture;
      }
      if (session.user) {
        session.user.role = typeof token.role === "string" ? token.role : "user";
      }
      if (session.user && typeof token.uid === "number") {
        session.user.uid = token.uid;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
