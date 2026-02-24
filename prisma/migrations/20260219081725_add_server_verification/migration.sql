-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "is_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verify_expires_at" TIMESTAMP(3),
ADD COLUMN     "verify_token" TEXT;
