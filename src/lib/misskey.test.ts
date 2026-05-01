import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeStartedMiAuthSession,
  isLocalMisskeyUser,
  isValidMiAuthSessionId,
} from "@/lib/misskey";

test("isValidMiAuthSessionId accepts a UUIDv4-shaped string", () => {
  assert.equal(isValidMiAuthSessionId("0e7b9b0c-1234-4abc-9def-0123456789ab"), true);
});

test("isValidMiAuthSessionId rejects non-UUID inputs", () => {
  for (const candidate of [
    "",
    "abc",
    "../../etc/passwd",
    "0e7b9b0c-1234-4abc-9def-0123456789ab/",
    "0e7b9b0c12344abc9def0123456789ab",
    null,
    undefined,
    42,
  ]) {
    assert.equal(isValidMiAuthSessionId(candidate as unknown), false, `${String(candidate)} must be invalid`);
  }
});

test("isLocalMisskeyUser accepts users on the configured instance", () => {
  assert.equal(isLocalMisskeyUser({ host: null }), true);
});

test("isLocalMisskeyUser rejects federated users", () => {
  assert.equal(isLocalMisskeyUser({ host: "evil.example" }), false);
});

function makeStubRedis(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async getdel(key: string) {
      const value = store.get(key);
      if (value === undefined) return null;
      store.delete(key);
      return value;
    },
  };
}

test("consumeStartedMiAuthSession returns the stored callbackUrl and deletes the key", async () => {
  const sessionId = "11111111-2222-4333-8444-555555555555";
  const redis = makeStubRedis({ [`miauth:start:${sessionId}`]: "/console" });

  const first = await consumeStartedMiAuthSession(redis, sessionId);
  assert.deepEqual(first, { callbackUrl: "/console" });
  assert.equal(redis.store.size, 0, "key must be removed after consumption");

  const second = await consumeStartedMiAuthSession(redis, sessionId);
  assert.equal(second, null, "second consumption must yield null (replay-safe)");
});

test("consumeStartedMiAuthSession returns null when start route never minted the session", async () => {
  const redis = makeStubRedis({});
  const forged = "ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb";

  const result = await consumeStartedMiAuthSession(redis, forged);

  assert.equal(result, null);
});
