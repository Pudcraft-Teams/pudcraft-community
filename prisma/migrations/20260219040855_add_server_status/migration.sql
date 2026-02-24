-- AlterTable
ALTER TABLE "server_statuses" ADD COLUMN     "error" TEXT,
ADD COLUMN     "version" TEXT,
ALTER COLUMN "online" SET DEFAULT false;

-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "is_online" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_pinged_at" TIMESTAMP(3),
ADD COLUMN     "latency" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_players" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "player_count" INTEGER NOT NULL DEFAULT 0;
