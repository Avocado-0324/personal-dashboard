-- Initial portfolio schema migration

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "type" text NOT NULL,
  "broker" text,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "type_check" CHECK (type IN ('tokutei','nisa_growth','nisa_tsumitate','cash','other'))
);

CREATE TABLE IF NOT EXISTS "instruments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "symbol" text NOT NULL,
  "name" text NOT NULL,
  "asset_class" text NOT NULL,
  "currency" char(3) NOT NULL,
  "unit_basis" numeric(10,2) NOT NULL DEFAULT 1,
  CONSTRAINT "asset_class_check" CHECK (asset_class IN ('jp_stock','us_stock','fund','etf','bond','reit','crypto','other')),
  UNIQUE(symbol, currency)
);

CREATE TABLE IF NOT EXISTS "snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "as_of" date NOT NULL,
  "source" text NOT NULL,
  "batch_id" uuid,
  "note" text,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "source_check" CHECK (source IN ('manual','csv','screenshot'))
);

CREATE TABLE IF NOT EXISTS "positions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_id" uuid NOT NULL REFERENCES "snapshots"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "instrument_id" uuid NOT NULL REFERENCES "instruments"("id"),
  "quantity" numeric(24,8) NOT NULL,
  "avg_cost" numeric(24,8) NOT NULL,
  "price" numeric(24,8) NOT NULL,
  "fx_rate_to_jpy" numeric(14,6) NOT NULL DEFAULT 1,
  UNIQUE(snapshot_id, account_id, instrument_id)
);

CREATE TABLE IF NOT EXISTS "cash_balances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "snapshot_id" uuid NOT NULL REFERENCES "snapshots"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "currency" char(3) NOT NULL,
  "amount" numeric(20,2) NOT NULL,
  "fx_rate_to_jpy" numeric(14,6) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS "cash_flows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid REFERENCES "accounts"("id"),
  "date" date NOT NULL,
  "direction" text NOT NULL,
  "amount_jpy" numeric(20,2) NOT NULL,
  "note" text,
  "source" text NOT NULL,
  "batch_id" uuid,
  CONSTRAINT "direction_check" CHECK (direction IN ('deposit','withdrawal')),
  CONSTRAINT "source_check" CHECK (source IN ('manual','csv','screenshot')),
  CONSTRAINT "amount_check" CHECK (amount_jpy > 0)
);

CREATE TABLE IF NOT EXISTS "import_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" text NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "filename" text,
  "row_count" integer,
  "status" text NOT NULL DEFAULT 'committed',
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "source_check" CHECK (source IN ('csv','screenshot')),
  CONSTRAINT "status_check" CHECK (status IN ('committed','reverted'))
);

ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_batch_fk" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id");
ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_batch_fk" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id");

CREATE INDEX IF NOT EXISTS "snapshots_as_of_idx" ON "snapshots"("as_of" DESC);
CREATE INDEX IF NOT EXISTS "positions_snapshot_idx" ON "positions"("snapshot_id");
CREATE INDEX IF NOT EXISTS "cash_balances_snapshot_idx" ON "cash_balances"("snapshot_id");
CREATE INDEX IF NOT EXISTS "cash_flows_date_idx" ON "cash_flows"("date");
CREATE INDEX IF NOT EXISTS "import_batches_idempotency_idx" ON "import_batches"("idempotency_key");
