-- CreateTable
CREATE TABLE "changelogs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'feature',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "changelogs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "changelogs_published_published_at_idx" ON "changelogs"("published", "published_at" DESC);

-- CreateIndex
CREATE INDEX "changelogs_created_at_idx" ON "changelogs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "changelogs" ADD CONSTRAINT "changelogs_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "unique_type_numeric_id" RENAME TO "reserved_numeric_ids_type_numeric_id_key";
