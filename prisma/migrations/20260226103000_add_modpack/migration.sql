-- CreateTable
CREATE TABLE "modpacks" (
    "id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "uploader_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "loader" TEXT,
    "game_version" TEXT,
    "summary" TEXT,
    "file_key" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "sha1" TEXT NOT NULL,
    "sha512" TEXT NOT NULL,
    "mr_index" JSONB NOT NULL,
    "mods_count" INTEGER NOT NULL,
    "has_overrides" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modpacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "modpacks_server_id_idx" ON "modpacks"("server_id");

-- AddForeignKey
ALTER TABLE "modpacks" ADD CONSTRAINT "modpacks_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modpacks" ADD CONSTRAINT "modpacks_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
