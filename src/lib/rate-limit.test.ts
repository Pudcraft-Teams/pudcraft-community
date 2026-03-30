import assert from "node:assert/strict";
import test from "node:test";

import {
  applyInMemoryRateLimit,
  createRateLimitResult,
} from "@/lib/rate-limit";

test("createRateLimitResult reports allowed counts and remaining slots", () => {
  assert.deepEqual(createRateLimitResult(3, 5), {
    allowed: true,
    remaining: 2,
  });
});

test("createRateLimitResult clamps remaining slots at zero once exhausted", () => {
  assert.deepEqual(createRateLimitResult(7, 5), {
    allowed: false,
    remaining: 0,
  });
});

test("applyInMemoryRateLimit degrades to process-local counters instead of hard blocking", () => {
  const store = new Map<string, { count: number; expiresAt: number }>();

  assert.deepEqual(applyInMemoryRateLimit(store, "rl:test:1", 3, 60, 1_000), {
    allowed: true,
    remaining: 2,
    degraded: true,
  });
  assert.deepEqual(applyInMemoryRateLimit(store, "rl:test:1", 3, 60, 2_000), {
    allowed: true,
    remaining: 1,
    degraded: true,
  });
  assert.deepEqual(applyInMemoryRateLimit(store, "rl:test:1", 3, 60, 3_000), {
    allowed: true,
    remaining: 0,
    degraded: true,
  });
  assert.deepEqual(applyInMemoryRateLimit(store, "rl:test:1", 3, 60, 4_000), {
    allowed: false,
    remaining: 0,
    degraded: true,
  });
});

test("applyInMemoryRateLimit resets once the fallback window expires", () => {
  const store = new Map<string, { count: number; expiresAt: number }>();

  assert.deepEqual(applyInMemoryRateLimit(store, "rl:test:1", 2, 60, 1_000), {
    allowed: true,
    remaining: 1,
    degraded: true,
  });
  assert.deepEqual(applyInMemoryRateLimit(store, "rl:test:1", 2, 60, 61_000), {
    allowed: true,
    remaining: 1,
    degraded: true,
  });
});
