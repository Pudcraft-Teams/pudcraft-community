DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_class
        WHERE relkind = 'i' AND relname = 'unique_type_numeric_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_class
        WHERE relkind = 'i' AND relname = 'reserved_numeric_ids_type_numeric_id_key'
    ) THEN
        ALTER INDEX "unique_type_numeric_id" RENAME TO "reserved_numeric_ids_type_numeric_id_key";
    END IF;
END $$;
