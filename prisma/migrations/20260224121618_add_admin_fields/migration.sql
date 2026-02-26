-- AlterTable
ALTER TABLE "servers"
ADD COLUMN "reject_reason" TEXT,
ADD COLUMN "status" TEXT;

-- Keep all legacy servers publicly visible after rollout.
UPDATE "servers"
SET "status" = 'approved'
WHERE "status" IS NULL;

-- Enforce review workflow defaults for new submissions.
ALTER TABLE "servers"
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ban_reason" TEXT,
ADD COLUMN     "banned_at" TIMESTAMP(3),
ADD COLUMN     "is_banned" BOOLEAN NOT NULL DEFAULT false;
