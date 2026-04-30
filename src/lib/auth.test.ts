import assert from "node:assert/strict";
import test from "node:test";

function applyAuthTestEnv() {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/pudcraft_test";
  process.env.NEXTAUTH_SECRET = "test-secret-value";
  process.env.AUTH_SECRET = "test-secret-value";
  process.env.MISSKEY_HOST = "misskey.test";
  process.env.MISSKEY_TICKET_SECRET = "0123456789abcdef0123456789abcdef";
}

const dateA = new Date("2026-01-01T00:00:00.000Z");
const dateB = new Date("2026-02-01T00:00:00.000Z");

test("isSessionTokenStateValid rejects tokens without a session version", async () => {
  applyAuthTestEnv();
  const { isSessionTokenStateValid } = await import("@/lib/auth");

  assert.equal(
    isSessionTokenStateValid({
      tokenSessionVersion: undefined,
      lastLoginAt: dateA,
      isBanned: false,
    }),
    false,
  );
});

test("isSessionTokenStateValid rejects tokens after a fresh login (lastLoginAt changed)", async () => {
  applyAuthTestEnv();
  const { createLoginSessionVersion, isSessionTokenStateValid } = await import("@/lib/auth");

  assert.equal(
    isSessionTokenStateValid({
      tokenSessionVersion: createLoginSessionVersion(dateA),
      lastLoginAt: dateB,
      isBanned: false,
    }),
    false,
  );
});

test("isSessionTokenStateValid rejects banned users even when session version matches", async () => {
  applyAuthTestEnv();
  const { createLoginSessionVersion, isSessionTokenStateValid } = await import("@/lib/auth");

  assert.equal(
    isSessionTokenStateValid({
      tokenSessionVersion: createLoginSessionVersion(dateA),
      lastLoginAt: dateA,
      isBanned: true,
    }),
    false,
  );
});

test("isSessionTokenStateValid accepts active users when the session version matches", async () => {
  applyAuthTestEnv();
  const { createLoginSessionVersion, isSessionTokenStateValid } = await import("@/lib/auth");

  assert.equal(
    isSessionTokenStateValid({
      tokenSessionVersion: createLoginSessionVersion(dateA),
      lastLoginAt: dateA,
      isBanned: false,
    }),
    true,
  );
});

test("jwt callback returns null for stale session tokens so Auth.js can clear the session", async () => {
  applyAuthTestEnv();
  const { authConfig, createLoginSessionVersion } = await import("@/lib/auth");
  const { db } = await import("@/lib/db");

  const jwtCallback = authConfig.callbacks?.jwt;
  if (!jwtCallback) {
    throw new Error("expected auth jwt callback");
  }

  const dbUser = db.user as unknown as {
    findUnique: () => Promise<{ lastLoginAt: Date | null; isBanned: boolean } | null>;
  };
  const originalFindUnique = dbUser.findUnique;
  dbUser.findUnique = async () => ({
    lastLoginAt: dateB,
    isBanned: false,
  });

  try {
    type JwtCallbackParams = Parameters<typeof jwtCallback>[0];

    const result = await jwtCallback({
      token: {
        id: "user-1",
        name: "User",
        picture: null,
        role: "user",
        misskeyId: "9abc1234",
        misskeyUsername: "user1",
        profileHydrated: true,
        sessionVersion: createLoginSessionVersion(dateA),
      },
      user: undefined as unknown as JwtCallbackParams["user"],
      trigger: undefined,
      session: undefined,
    } as unknown as JwtCallbackParams);

    assert.equal(result, null);
  } finally {
    dbUser.findUnique = originalFindUnique;
  }
});

test("jwt callback ignores client session profile updates and preserves synced Misskey avatar URLs", async () => {
  applyAuthTestEnv();
  const { authConfig, createLoginSessionVersion } = await import("@/lib/auth");
  const { db } = await import("@/lib/db");

  const jwtCallback = authConfig.callbacks?.jwt;
  if (!jwtCallback) {
    throw new Error("expected auth jwt callback");
  }

  const dbUser = db.user as unknown as {
    findUnique: () => Promise<{
      name: string;
      image: string;
      role: string;
      misskeyId: string;
      misskeyUsername: string;
      lastLoginAt: Date | null;
      isBanned: boolean;
    } | null>;
  };
  const originalFindUnique = dbUser.findUnique;
  dbUser.findUnique = async () => ({
    name: "Synced Misskey Name",
    image: "https://misskey.test/files/avatar.webp",
    role: "user",
    misskeyId: "9abc1234",
    misskeyUsername: "synced_user",
    lastLoginAt: dateA,
    isBanned: false,
  });

  try {
    type JwtCallbackParams = Parameters<typeof jwtCallback>[0];

    const result = await jwtCallback({
      token: {
        id: "user-1",
        name: "Old Name",
        picture: null,
        role: "user",
        misskeyId: "9abc1234",
        misskeyUsername: "old_user",
        profileHydrated: true,
        sessionVersion: createLoginSessionVersion(dateA),
      },
      user: undefined as unknown as JwtCallbackParams["user"],
      trigger: "update",
      session: {
        name: "Spoofed Client Name",
        image: "https://evil.example/avatar.webp",
      } as unknown as JwtCallbackParams["session"],
    } as unknown as JwtCallbackParams);

    assert.equal(result?.name, "Synced Misskey Name");
    assert.equal(result?.picture, "https://misskey.test/files/avatar.webp");
    assert.equal(result?.misskeyUsername, "synced_user");
  } finally {
    dbUser.findUnique = originalFindUnique;
  }
});
