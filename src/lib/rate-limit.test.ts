import assert from "node:assert/strict";
import test from "node:test";

import {
  createRateLimitFailureResult,
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

test("createRateLimitFailureResult fails closed when Redis is unavailable", () => {
  assert.deepEqual(createRateLimitFailureResult(10), {
    allowed: false,
    remaining: 0,
  });
});
