import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVerifyJobResult } from "./verify-job-result";

const INVALID_REASON = "invalid-result";

test("parseVerifyJobResult: valid reasonKey is preserved", () => {
  const result = parseVerifyJobResult(
    { success: false, reasonKey: "tokenExpired" },
    INVALID_REASON,
  );

  assert.equal(result.success, false);
  assert.equal(result.reasonKey, "tokenExpired");
  assert.equal(result.reason, undefined);
});

test("parseVerifyJobResult: unknown reasonKey is dropped, falls back to reason", () => {
  const result = parseVerifyJobResult(
    { success: false, reasonKey: "somethingElse", reason: "legacy text" },
    INVALID_REASON,
  );

  assert.equal(result.success, false);
  assert.equal(result.reasonKey, undefined);
  assert.equal(result.reason, "legacy text");
});

test("parseVerifyJobResult: unknown reasonKey with no reason yields neither field", () => {
  const result = parseVerifyJobResult(
    { success: false, reasonKey: "somethingElse" },
    INVALID_REASON,
  );

  assert.equal(result.success, false);
  assert.equal(result.reasonKey, undefined);
  assert.equal(result.reason, undefined);
});

test("parseVerifyJobResult: legacy reason-only payload still works", () => {
  const result = parseVerifyJobResult(
    { success: false, reason: "legacy offline message" },
    INVALID_REASON,
  );

  assert.equal(result.success, false);
  assert.equal(result.reasonKey, undefined);
  assert.equal(result.reason, "legacy offline message");
});

test("parseVerifyJobResult: when both reasonKey and reason are present, both are surfaced", () => {
  // The API layer prefers reasonKey for localization, but we keep reason
  // around so legacy clients / logs do not lose the original text.
  const result = parseVerifyJobResult(
    { success: false, reasonKey: "serverOffline", reason: "the pre-translated message" },
    INVALID_REASON,
  );

  assert.equal(result.success, false);
  assert.equal(result.reasonKey, "serverOffline");
  assert.equal(result.reason, "the pre-translated message");
});

test("parseVerifyJobResult: non-object raw returns the invalidReason fallback", () => {
  assert.deepEqual(parseVerifyJobResult(null, INVALID_REASON), {
    success: false,
    reason: INVALID_REASON,
  });
  assert.deepEqual(parseVerifyJobResult(undefined, INVALID_REASON), {
    success: false,
    reason: INVALID_REASON,
  });
  assert.deepEqual(parseVerifyJobResult("oops", INVALID_REASON), {
    success: false,
    reason: INVALID_REASON,
  });
  assert.deepEqual(parseVerifyJobResult(42, INVALID_REASON), {
    success: false,
    reason: INVALID_REASON,
  });
});

test("parseVerifyJobResult: success: true payload without reason fields works", () => {
  const result = parseVerifyJobResult({ success: true }, INVALID_REASON);

  assert.equal(result.success, true);
  assert.equal(result.reasonKey, undefined);
  assert.equal(result.reason, undefined);
});

test("parseVerifyJobResult: object payload with neither field yields only success", () => {
  const result = parseVerifyJobResult({ success: false }, INVALID_REASON);

  assert.equal(result.success, false);
  assert.equal(result.reasonKey, undefined);
  assert.equal(result.reason, undefined);
});

test("parseVerifyJobResult: non-string reasonKey is ignored", () => {
  const result = parseVerifyJobResult(
    { success: false, reasonKey: 123, reason: "fallback" },
    INVALID_REASON,
  );

  assert.equal(result.success, false);
  assert.equal(result.reasonKey, undefined);
  assert.equal(result.reason, "fallback");
});

test("parseVerifyJobResult: truthy-but-not-true success is normalized to false", () => {
  // `success === true` is an exact identity check; "true" strings,
  // numbers, etc. must not be interpreted as success.
  const result = parseVerifyJobResult(
    { success: "true", reasonKey: "tokenExpired" },
    INVALID_REASON,
  );

  assert.equal(result.success, false);
  assert.equal(result.reasonKey, "tokenExpired");
});
