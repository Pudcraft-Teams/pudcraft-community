-- DropForeignKey
ALTER TABLE "circles" DROP CONSTRAINT "circles_creator_id_fkey";

-- DropForeignKey
ALTER TABLE "circles" DROP CONSTRAINT "circles_server_id_fkey";

-- DropForeignKey
ALTER TABLE "circle_memberships" DROP CONSTRAINT "circle_memberships_user_id_fkey";

-- DropForeignKey
ALTER TABLE "circle_memberships" DROP CONSTRAINT "circle_memberships_circle_id_fkey";

-- DropForeignKey
ALTER TABLE "sections" DROP CONSTRAINT "sections_circle_id_fkey";

-- DropForeignKey
ALTER TABLE "posts" DROP CONSTRAINT "posts_author_id_fkey";

-- DropForeignKey
ALTER TABLE "posts" DROP CONSTRAINT "posts_circle_id_fkey";

-- DropForeignKey
ALTER TABLE "posts" DROP CONSTRAINT "posts_section_id_fkey";

-- DropForeignKey
ALTER TABLE "forum_comments" DROP CONSTRAINT "forum_comments_author_id_fkey";

-- DropForeignKey
ALTER TABLE "forum_comments" DROP CONSTRAINT "forum_comments_post_id_fkey";

-- DropForeignKey
ALTER TABLE "forum_comments" DROP CONSTRAINT "forum_comments_parent_comment_id_fkey";

-- DropForeignKey
ALTER TABLE "post_likes" DROP CONSTRAINT "post_likes_user_id_fkey";

-- DropForeignKey
ALTER TABLE "post_likes" DROP CONSTRAINT "post_likes_post_id_fkey";

-- DropForeignKey
ALTER TABLE "comment_likes" DROP CONSTRAINT "comment_likes_user_id_fkey";

-- DropForeignKey
ALTER TABLE "comment_likes" DROP CONSTRAINT "comment_likes_comment_id_fkey";

-- DropForeignKey
ALTER TABLE "bookmarks" DROP CONSTRAINT "bookmarks_user_id_fkey";

-- DropForeignKey
ALTER TABLE "bookmarks" DROP CONSTRAINT "bookmarks_post_id_fkey";

-- DropForeignKey
ALTER TABLE "forum_notifications" DROP CONSTRAINT "forum_notifications_recipient_id_fkey";

-- DropForeignKey
ALTER TABLE "forum_notifications" DROP CONSTRAINT "forum_notifications_source_user_id_fkey";

-- DropForeignKey
ALTER TABLE "forum_notifications" DROP CONSTRAINT "forum_notifications_post_id_fkey";

-- DropForeignKey
ALTER TABLE "forum_notifications" DROP CONSTRAINT "forum_notifications_comment_id_fkey";

-- DropForeignKey
ALTER TABLE "circle_bans" DROP CONSTRAINT "circle_bans_circle_id_fkey";

-- DropForeignKey
ALTER TABLE "circle_bans" DROP CONSTRAINT "circle_bans_user_id_fkey";

-- DropForeignKey
ALTER TABLE "circle_bans" DROP CONSTRAINT "circle_bans_banned_by_fkey";

-- DropForeignKey
ALTER TABLE "post_tags" DROP CONSTRAINT "post_tags_post_id_fkey";

-- DropForeignKey
ALTER TABLE "post_tags" DROP CONSTRAINT "post_tags_tag_id_fkey";

-- Remove legacy forum reports before dropping forum tables so they do not survive
-- as zombie moderation items. Keep server comment reports intact.
DELETE FROM "reports"
WHERE "target_type" IN ('post', 'forum_comment');

-- DropTable
DROP TABLE "circles";

-- DropTable
DROP TABLE "circle_memberships";

-- DropTable
DROP TABLE "sections";

-- DropTable
DROP TABLE "posts";

-- DropTable
DROP TABLE "forum_comments";

-- DropTable
DROP TABLE "post_likes";

-- DropTable
DROP TABLE "comment_likes";

-- DropTable
DROP TABLE "bookmarks";

-- DropTable
DROP TABLE "forum_notifications";

-- DropTable
DROP TABLE "circle_bans";

-- DropTable
DROP TABLE "tags";

-- DropTable
DROP TABLE "post_tags";

-- DropEnum
DROP TYPE "CircleRole";

-- DropEnum
DROP TYPE "PostStatus";

-- DropEnum
DROP TYPE "CommentStatus";

-- DropEnum
DROP TYPE "NotificationType";
