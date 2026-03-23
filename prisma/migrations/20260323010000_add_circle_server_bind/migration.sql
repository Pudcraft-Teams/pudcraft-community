-- AlterTable
ALTER TABLE "circles" ADD COLUMN     "server_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "circles_server_id_key" ON "circles"("server_id");

-- AddForeignKey
ALTER TABLE "circles" ADD CONSTRAINT "circles_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

