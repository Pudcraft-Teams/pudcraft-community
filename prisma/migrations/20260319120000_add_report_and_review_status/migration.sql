-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "review_status" TEXT NOT NULL DEFAULT 'unreviewed',
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT;

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" VARCHAR(500),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "actions" TEXT,
    "admin_note" VARCHAR(500),
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_created_at_idx" ON "reports"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporter_id_target_type_target_id_key" ON "reports"("reporter_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "servers_review_status_idx" ON "servers"("review_status");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
