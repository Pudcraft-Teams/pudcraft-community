-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "reject_reason" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ban_reason" TEXT,
ADD COLUMN     "banned_at" TIMESTAMP(3),
ADD COLUMN     "is_banned" BOOLEAN NOT NULL DEFAULT false;
