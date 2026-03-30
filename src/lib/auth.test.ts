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
