import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

const DUMMY_PASSWORD_HASH = "$2b$12$7MsJQQUhISt6L0QkQlym9eQygPzy5Q89vgzW0fvkYl9wH8r2raVGm";

class BannedUserError extends CredentialsSignin {
  code = "banned";
}

function getClientIp(request?: Pick<Request, "headers"> | null): string {
  const forwardedFor = request?.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const candidate = forwardedFor.split(",")[0]?.trim();
    if (candidate) {
      return candidate;
    }
  }

  const realIp = request?.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
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
          await bcrypt.compare(rawPassword, DUMMY_PASSWORD_HASH);
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
          await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
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
          image: user.image,
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
          !!user || trigger === "update" || token.profileHydrated !== true;

        if (shouldRefreshProfile) {
          const latestUser = await db.user.findUnique({
            where: { id: token.id },
            select: {
              name: true,
              email: true,
              image: true,
              role: true,
            },
          });

          if (latestUser) {
            token.name = latestUser.name;
            token.email = latestUser.email;
            token.picture = latestUser.image;
            token.role = latestUser.role;
          }

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
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      if (session.user) {
        session.user.name = typeof token.name === "string" ? token.name : null;
      }
      if (session.user && typeof token.email === "string") {
        session.user.email = token.email;
      }
      if (
        session.user &&
        (typeof token.picture === "string" || token.picture === null)
      ) {
        session.user.image = token.picture;
      }
      if (session.user) {
        session.user.role = typeof token.role === "string" ? token.role : "user";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
