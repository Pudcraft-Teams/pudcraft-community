-- Replace local credentials login with Misskey MiAuth.
-- Drops NextAuth adapter tables and preserves existing business data by
-- assigning legacy placeholder Misskey identities to pre-MiAuth users.

-- DropTable: NextAuth adapter tables (PrismaAdapter no longer used; JWT-only)
DROP TABLE IF EXISTS "accounts" CASCADE;
DROP TABLE IF EXISTS "sessions" CASCADE;
DROP TABLE IF EXISTS "verification_tokens" CASCADE;

-- Reserved numeric ids: drop the uid pool (no longer issued); keep psid pool.
DELETE FROM "reserved_numeric_ids" WHERE "type" = 'uid';

-- DropIndex
DROP INDEX IF EXISTS "users_uid_key";
DROP INDEX IF EXISTS "users_email_key";

-- AlterTable: add Misskey identity columns nullable first so existing rows can
-- be backfilled without deleting owned servers, comments, reports, or sync data.
ALTER TABLE "users"
  ADD COLUMN "misskey_id" TEXT,
  ADD COLUMN "misskey_username" TEXT,
  ADD COLUMN "last_login_at" TIMESTAMP(3);

-- Backfill pre-MiAuth users with stable placeholders. These rows cannot sign in
-- via Misskey, but keeping them preserves ownership and historical relations for
-- manual reconciliation.
UPDATE "users"
SET
  "misskey_id" = COALESCE("misskey_id", 'legacy-' || "id"),
  "misskey_username" = COALESCE(
    "misskey_username",
    'legacy-' || COALESCE("uid"::TEXT, "id")
  );

ALTER TABLE "users"
  ALTER COLUMN "misskey_id" SET NOT NULL,
  ALTER COLUMN "misskey_username" SET NOT NULL;

-- AlterTable: drop legacy credential columns after the placeholder backfill.
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "uid",
  DROP COLUMN IF EXISTS "email",
  DROP COLUMN IF EXISTS "email_verified",
  DROP COLUMN IF EXISTS "password_hash";

-- CreateIndex
CREATE UNIQUE INDEX "users_misskey_id_key" ON "users"("misskey_id");
