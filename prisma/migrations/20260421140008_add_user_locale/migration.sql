-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'zh';

-- RenameIndex
ALTER INDEX "unique_type_numeric_id" RENAME TO "reserved_numeric_ids_type_numeric_id_key";
