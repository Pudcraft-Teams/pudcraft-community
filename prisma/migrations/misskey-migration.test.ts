import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

test("Misskey takeover migration preserves business data tables", () => {
  const sql = readFileSync(
    path.join(
      repoRoot,
      "prisma/migrations/20260429120000_replace_credentials_with_misskey/migration.sql",
    ),
    "utf8",
  );

  assert.doesNotMatch(sql, /\bTRUNCATE\s+TABLE\b/i);
  for (const table of [
    "servers",
    "comments",
    "favorites",
    "modpacks",
    "notifications",
    "reports",
    "whitelist_syncs",
  ]) {
    assert.doesNotMatch(sql, new RegExp(`DROP\\s+TABLE\\s+(IF\\s+EXISTS\\s+)?["']?${table}`, "i"));
  }
});
