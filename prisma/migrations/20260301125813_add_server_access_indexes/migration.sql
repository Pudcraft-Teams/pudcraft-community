-- CreateIndex
CREATE INDEX "favorites_server_id_idx" ON "favorites"("server_id");

-- CreateIndex
CREATE INDEX "servers_status_idx" ON "servers"("status");

-- CreateIndex
CREATE INDEX "servers_owner_id_idx" ON "servers"("owner_id");
