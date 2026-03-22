-- AlterTable: change posts.content from JSONB to TEXT
ALTER TABLE "posts" ALTER COLUMN "content" TYPE TEXT USING "content"::TEXT;
