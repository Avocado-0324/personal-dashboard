-- Drop the old unique constraint on idempotency_key
ALTER TABLE "import_batches" DROP CONSTRAINT IF EXISTS "import_batches_idempotency_key_unique";

-- Create partial unique index: only applies to non-reverted batches
CREATE UNIQUE INDEX IF NOT EXISTS "import_batches_idempotency_key_unique_not_reverted" 
ON "import_batches" ("idempotency_key") 
WHERE "status" <> 'reverted';

-- Convert created_at columns from timestamp to timestamptz
ALTER TABLE "import_batches" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "accounts" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "snapshots" ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';
