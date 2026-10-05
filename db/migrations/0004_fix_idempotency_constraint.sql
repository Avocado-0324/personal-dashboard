-- Fix unique constraint on idempotency_key
-- 0001 created constraint with auto-generated name 'import_batches_idempotency_key_key'
-- 0003 tried to drop 'import_batches_idempotency_key_unique' which didn't exist

-- Drop any existing full-table unique constraints on idempotency_key
-- Note: DROP CONSTRAINT will also drop the associated index automatically
ALTER TABLE "import_batches" DROP CONSTRAINT IF EXISTS "import_batches_idempotency_key_key";
ALTER TABLE "import_batches" DROP CONSTRAINT IF EXISTS "import_batches_idempotency_key_unique";

-- Ensure partial unique index exists (idempotent with 0003)
CREATE UNIQUE INDEX IF NOT EXISTS "import_batches_idempotency_key_unique_not_reverted" 
ON "import_batches" ("idempotency_key") 
WHERE "status" <> 'reverted';

-- Self-check: verify no full-table unique constraint remains
DO $$
DECLARE
  constraint_count INTEGER;
BEGIN
  -- Check for unique constraints on idempotency_key (excluding partial indexes)
  SELECT COUNT(*) INTO constraint_count
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  JOIN pg_namespace n ON t.relnamespace = n.oid
  WHERE t.relname = 'import_batches'
    AND n.nspname = 'public'
    AND c.contype = 'u'
    AND c.conkey = (
      SELECT ARRAY[a.attnum]
      FROM pg_attribute a
      WHERE a.attrelid = t.oid
        AND a.attname = 'idempotency_key'
    );

  IF constraint_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: Full-table unique constraint still exists on import_batches.idempotency_key';
  END IF;
END $$;
