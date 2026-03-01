-- AlterTable: remove latency from servers
ALTER TABLE "servers" DROP COLUMN IF EXISTS "latency";

-- AlterTable: remove latency_ms from server_statuses
ALTER TABLE "server_statuses" DROP COLUMN IF EXISTS "latency_ms";
