import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id: string;
      uid: number;
      role: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    uid?: number;
    role?: string;
    profileHydrated?: boolean;
    sessionVersion?: string;
    invalidated?: boolean;
  }
}
