import assert from "node:assert/strict";
import test from "node:test";

import { userLookupIdSchema } from "@/lib/validation";

test("userLookupIdSchema accepts a Misskey aid", () => {
  assert.equal(userLookupIdSchema.safeParse("a1b2c3d4e5f6").success, true);
});

test("userLookupIdSchema accepts a local cuid", () => {
  // 25-char cuid (`c` + 24 base36 chars)
  assert.equal(userLookupIdSchema.safeParse("ckpqr0sm10000xy0d8z9af2gh").success, true);
});

test("userLookupIdSchema accepts the legacy- placeholder produced by the credentials migration", () => {
  // The 20260429120000_replace_credentials_with_misskey migration backfills
  // pre-MiAuth users with `misskey_id = 'legacy-' || id`. Without this branch,
  // every link to those accounts (`/u/{misskeyId}`) 400s before the lookup
  // helper can resolve them.
  for (const id of [
    "legacy-1",
    "legacy-42",
    "legacy-ckpqr0sm10000xy0d8z9af2gh",
  ]) {
    assert.equal(userLookupIdSchema.safeParse(id).success, true, `must accept ${id}`);
  }
});

test("userLookupIdSchema still rejects malformed values", () => {
  for (const bad of ["", "ab", "../../etc/passwd", "legacy-", "LEGACY-!!"]) {
    assert.equal(userLookupIdSchema.safeParse(bad).success, false, `must reject ${bad}`);
  }
});
