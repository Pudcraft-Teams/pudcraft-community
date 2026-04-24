import assert from "node:assert/strict";
import test from "node:test";
import zhMessages from "../../messages/zh.json";

function applyAuthGuardTestEnv() {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/pudcraft_test";
  process.env.NEXTAUTH_SECRET = "test-secret-value";
  process.env.AUTH_SECRET = "test-secret-value";
}

const zhAuthErrors = zhMessages.errors.api.auth;

test("resolveActiveUserResult returns 401 when there is no authenticated user id", async () => {
  applyAuthGuardTestEnv();
  const { getAuthGuardTranslator, isActiveUserError, resolveActiveUserResult } = await import(
    "@/lib/auth-guard"
  );

  const result = resolveActiveUserResult(null, null, getAuthGuardTranslator("zh"));

  assert.equal(isActiveUserError(result), true);
  if (!isActiveUserError(result)) {
    throw new Error("expected an auth error response");
  }

  assert.equal(result.response.status, 401);
  assert.deepEqual(await result.response.json(), { error: zhAuthErrors.notAuthenticated });
});

test("resolveActiveUserResult returns 403 for banned users", async () => {
  applyAuthGuardTestEnv();
  const { getAuthGuardTranslator, isActiveUserError, resolveActiveUserResult } = await import(
    "@/lib/auth-guard"
  );

  const result = resolveActiveUserResult(
    "user-1",
    {
      id: "user-1",
      role: "user",
      name: "Banned",
      isBanned: true,
    },
    getAuthGuardTranslator("zh"),
  );

  assert.equal(isActiveUserError(result), true);
  if (!isActiveUserError(result)) {
    throw new Error("expected an auth error response");
  }

  assert.equal(result.response.status, 403);
  assert.deepEqual(await result.response.json(), { error: zhAuthErrors.banned });
});

test("resolveActiveUserResult returns the active user payload for unbanned users", async () => {
  applyAuthGuardTestEnv();
  const { getAuthGuardTranslator, isActiveUserError, resolveActiveUserResult } = await import(
    "@/lib/auth-guard"
  );

  const result = resolveActiveUserResult(
    "user-1",
    {
      id: "user-1",
      role: "admin",
      name: "Active",
      isBanned: false,
    },
    getAuthGuardTranslator("zh"),
  );

  assert.equal(isActiveUserError(result), false);
  if (isActiveUserError(result)) {
    throw new Error("expected an active user");
  }

  assert.deepEqual(result.user, {
    id: "user-1",
    role: "admin",
    name: "Active",
  });
});
