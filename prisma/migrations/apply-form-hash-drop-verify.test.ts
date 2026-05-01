import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

test("apply-form hash + drop-verify migration ADDs form_content_hash and DROPs verify_* columns", () => {
  const sql = readFileSync(
    path.join(
      repoRoot,
      "prisma/migrations/20260501000000_apply_form_hash_drop_verify/migration.sql",
    ),
    "utf8",
  );

  assert.match(
    sql,
    /ALTER TABLE\s+"server_applications"[\s\S]*ADD COLUMN\s+"form_content_hash"\s+TEXT/i,
    "must add form_content_hash column on server_applications",
  );

  for (const column of ["verify_token", "verify_expires_at", "verify_user_id"]) {
    assert.match(
      sql,
      new RegExp(`DROP COLUMN(\\s+IF EXISTS)?\\s+"${column}"`, "i"),
      `must drop ${column} from servers`,
    );
  }

  // Sanity: never touch tables we are not in scope for.
  assert.doesNotMatch(sql, /\bTRUNCATE\s+TABLE\b/i);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
});

test("schema.prisma no longer declares the orphaned MOTD-verify columns", () => {
  const schema = readFileSync(path.join(repoRoot, "prisma/schema.prisma"), "utf8");

  for (const column of ["verify_token", "verify_expires_at", "verify_user_id"]) {
    assert.doesNotMatch(
      schema,
      new RegExp(`@map\\("${column}"\\)`),
      `${column} must not appear in any @map(...) directive`,
    );
  }

  // verifiedAt is the admin badge timestamp and must remain.
  assert.match(schema, /@map\("verified_at"\)/);
  // form_content_hash on server_applications must remain.
  assert.match(schema, /@map\("form_content_hash"\)/);
});
