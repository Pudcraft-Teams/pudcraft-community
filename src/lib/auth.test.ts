import assert from "node:assert/strict";
import test from "node:test";

function applyAuthTestEnv() {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/pudcraft_test";
  process.env.NEXTAUTH_SECRET = "test-secret-value";
  process.env.AUTH_SECRET = "test-secret-value";
}

test("isSessionTokenStateValid rejects tokens without a password session version", async () => {
  applyAuthTestEnv();
  const { isSessionTokenStateValid } = await import("@/lib/auth");

  assert.equal(
    isSessionTokenStateValid({
      tokenSessionVersion: undefined,
      latestPasswordHash: "hash-a",
      isBanned: false,
    }),
    false,
  );
});

test("isSessionTokenStateValid rejects tokens after password changes", async () => {
  applyAuthTestEnv();
  const { createPasswordSessionVersion, isSessionTokenStateValid } = await import("@/lib/auth");

  assert.equal(
    isSessionTokenStateValid({
      tokenSessionVersion: createPasswordSessionVersion("hash-a"),
      latestPasswordHash: "hash-b",
      isBanned: false,
    }),
    false,
  );
});

test("isSessionTokenStateValid rejects banned users even when password version matches", async () => {
  applyAuthTestEnv();
  const { createPasswordSessionVersion, isSessionTokenStateValid } = await import("@/lib/auth");

  assert.equal(
    isSessionTokenStateValid({
      tokenSessionVersion: createPasswordSessionVersion("hash-a"),
      latestPasswordHash: "hash-a",
      isBanned: true,
    }),
    false,
  );
});

test("isSessionTokenStateValid accepts active users when the password version matches", async () => {
  applyAuthTestEnv();
  const { createPasswordSessionVersion, isSessionTokenStateValid } = await import("@/lib/auth");

  assert.equal(
    isSessionTokenStateValid({
      tokenSessionVersion: createPasswordSessionVersion("hash-a"),
      latestPasswordHash: "hash-a",
      isBanned: false,
    }),
    true,
  );
});

test("jwt callback returns null for stale password session tokens so Auth.js can clear the session", async () => {
  applyAuthTestEnv();
  const { authConfig, createPasswordSessionVersion } = await import("@/lib/auth");
  const { db } = await import("@/lib/db");

  const jwtCallback = authConfig.callbacks?.jwt;
  if (!jwtCallback) {
    throw new Error("expected auth jwt callback");
  }

  const dbUser = db.user as unknown as {
    findUnique: () => Promise<{ passwordHash: string; isBanned: boolean } | null>;
  };
  const originalFindUnique = dbUser.findUnique;
  dbUser.findUnique = async () => ({
    passwordHash: "hash-b",
    isBanned: false,
  });

  try {
    type JwtCallbackParams = Parameters<typeof jwtCallback>[0];

    const result = await jwtCallback({
      token: {
        id: "user-1",
        name: "User",
        email: "user@example.com",
        picture: null,
        role: "user",
        uid: 100000001,
        profileHydrated: true,
        sessionVersion: createPasswordSessionVersion("hash-a"),
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
