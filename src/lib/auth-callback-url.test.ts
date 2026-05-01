import test from "node:test";
import assert from "node:assert/strict";

import { safeSameOriginCallbackUrl } from "@/lib/auth-callback-url";

test("safeSameOriginCallbackUrl returns '/' for null / undefined / empty input", () => {
  assert.equal(safeSameOriginCallbackUrl(null), "/");
  assert.equal(safeSameOriginCallbackUrl(undefined), "/");
  assert.equal(safeSameOriginCallbackUrl(""), "/");
  assert.equal(safeSameOriginCallbackUrl("   "), "/");
});

test("safeSameOriginCallbackUrl preserves benign same-origin paths", () => {
  assert.equal(safeSameOriginCallbackUrl("/"), "/");
  assert.equal(safeSameOriginCallbackUrl("/console"), "/console");
  assert.equal(
    safeSameOriginCallbackUrl("/servers/123?tab=overview"),
    "/servers/123?tab=overview",
  );
  assert.equal(safeSameOriginCallbackUrl("/foo#bar"), "/foo#bar");
});

test("safeSameOriginCallbackUrl rejects absolute URLs and protocol-relative inputs", () => {
  for (const evil of [
    "http://evil.example/path",
    "https://evil.example/path",
    "//evil.example/path",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "evil.example/foo",
  ]) {
    assert.equal(
      safeSameOriginCallbackUrl(evil),
      "/",
      `must reject open-redirect input: ${evil}`,
    );
  }
});

test("safeSameOriginCallbackUrl rejects backslash-based path-confusion attacks", () => {
  // Regression: WHATWG URL treats `\` as a path separator, so `/\evil.com`
  // resolves to `https://evil.com/...` after `new URL(value, origin)`. Both
  // raw and percent-encoded forms must be dropped.
  for (const evil of [
    "/\\evil.example",
    "/\\\\evil.example",
    "/%5Cevil.example",
    "/%5C%5Cevil.example",
    "/%5cevil.example",
    "/%2F%2Fevil.example",
    "/%2f%2fevil.example",
  ]) {
    assert.equal(
      safeSameOriginCallbackUrl(evil),
      "/",
      `must reject path-confusion input: ${evil}`,
    );
  }
});
