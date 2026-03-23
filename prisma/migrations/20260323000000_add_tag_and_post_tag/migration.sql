-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "tags_post_count_idx" ON "tags"("post_count" DESC);

-- CreateIndex
CREATE INDEX "tags_created_at_idx" ON "tags"("created_at" DESC);

-- CreateIndex
CREATE INDEX "post_tags_tag_id_idx" ON "post_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_tags_post_id_tag_id_key" ON "post_tags"("post_id", "tag_id");

-- CreateIndex
CREATE INDEX "servers_status_visibility_discoverable_idx" ON "servers"("status", "visibility", "discoverable");

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "unique_bookmark" RENAME TO "bookmarks_user_id_post_id_key";

-- RenameIndex
ALTER INDEX "unique_circle_ban" RENAME TO "circle_bans_circle_id_user_id_key";

-- RenameIndex
ALTER INDEX "unique_circle_membership" RENAME TO "circle_memberships_user_id_circle_id_key";

-- RenameIndex
ALTER INDEX "unique_comment_like" RENAME TO "comment_likes_user_id_comment_id_key";

-- RenameIndex
ALTER INDEX "unique_post_like" RENAME TO "post_likes_user_id_post_id_key";

