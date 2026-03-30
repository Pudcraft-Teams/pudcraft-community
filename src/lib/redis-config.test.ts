import assert from "node:assert/strict";
import test from "node:test";

import { getRedisConnectionOptions, parseRedisConfig } from "./redis-config";

test("parseRedisConfig keeps REDIS_URL unchanged when a database is specified", () => {
  const config = parseRedisConfig({
    REDIS_URL: "redis://default:secret@example.com:6380/4",
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(config.url, "redis://default:secret@example.com:6380/4");
  assert.equal(config.host, null);
  assert.equal(config.port, 6379);
});

test("getRedisConnectionOptions preserves the database number from REDIS_URL", () => {
  const connection = getRedisConnectionOptions({
    url: "redis://default:secret@example.com:6380/4",
    host: null,
    port: 6379,
    password: undefined,
  });

  assert.deepEqual(connection, {
    host: "example.com",
    port: 6380,
    username: "default",
    password: "secret",
    db: 4,
    tls: undefined,
  });
});

test("getRedisConnectionOptions falls back to explicit host config without injecting a database", () => {
  const connection = getRedisConnectionOptions({
    url: null,
    host: "redis.internal",
    port: 6381,
    password: "from-env",
  });

  assert.deepEqual(connection, {
    host: "redis.internal",
    port: 6381,
    password: "from-env",
  });
});
