import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

test("owner console does not query or link to admin report moderation", () => {
  const file = readFileSync(path.join(repoRoot, "src/app/console/page.tsx"), "utf8");

  assert.doesNotMatch(file, /\bprisma\.report\b/);
  assert.doesNotMatch(file, /["'`]\/admin\/reports["'`]/);
});
