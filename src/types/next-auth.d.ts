import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id: string;
      misskeyId: string;
      misskeyUsername: string;
      role: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    misskeyId?: string;
    misskeyUsername?: string;
    role?: string;
    profileHydrated?: boolean;
    sessionVersion?: string;
  }
}
