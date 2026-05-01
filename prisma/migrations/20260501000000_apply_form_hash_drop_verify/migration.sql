-- Add ServerApplication.formContentHash and drop the orphaned MOTD-verify columns.
--
-- Two effects in one migration because they share the post-overhaul cleanup story:
--
-- 1. Apply-form questionnaire editor (06febe4 / bb8e354) gates resubmits on a content
--    hash of the owner-form document at submit time. The schema declared
--    ServerApplication.formContentHash but the migration was never checked in;
--    production deploys lacked the column and POST /api/servers/[id]/applications
--    would 500 on the first submit.
--
-- 2. The user-architecture overhaul retired the MOTD claim/verify flow. The routes,
--    worker, lib, and pages were deleted, but the verify_token / verify_expires_at /
--    verify_user_id columns on `servers` survived. They are now never read or written
--    and represent live attack surface from a deleted feature.
--
-- The column adds and drops are both backwards-compatible at this point in the
-- rollout: no production code reads/writes the verify_* columns, and nothing reads
-- form_content_hash before the column exists (write paths cast through Prisma's
-- unchecked input type until the client is regenerated).

-- AlterTable: add hash column on server_applications. Nullable so legacy
-- applications submitted before this migration ran continue to load.
ALTER TABLE "server_applications"
  ADD COLUMN "form_content_hash" TEXT;

-- DropColumn: remove the orphaned MOTD-verify columns on `servers`.
ALTER TABLE "servers"
  DROP COLUMN IF EXISTS "verify_token",
  DROP COLUMN IF EXISTS "verify_expires_at",
  DROP COLUMN IF EXISTS "verify_user_id";
