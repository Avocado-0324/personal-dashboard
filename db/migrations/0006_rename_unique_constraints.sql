-- 把生产库里 CREATE TABLE UNIQUE(...) 自动生成的约束名，统一成 schema.ts 里的名字。
-- 幂等：旧名存在且新名不存在才 RENAME；已对齐或只有新名则跳过。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'instruments_symbol_currency_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'instruments_symbol_currency_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'instruments_symbol_currency_unique'
  ) THEN
    ALTER TABLE "instruments" RENAME CONSTRAINT "instruments_symbol_currency_key"
      TO "instruments_symbol_currency_unique";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'instruments_symbol_currency_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'instruments_symbol_currency_unique'
  ) THEN
    ALTER INDEX "instruments_symbol_currency_key" RENAME TO "instruments_symbol_currency_unique";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'positions_snapshot_id_account_id_instrument_id_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'positions_snapshot_account_instrument_unique'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'positions_snapshot_account_instrument_unique'
  ) THEN
    ALTER TABLE "positions" RENAME CONSTRAINT "positions_snapshot_id_account_id_instrument_id_key"
      TO "positions_snapshot_account_instrument_unique";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'positions_snapshot_id_account_id_instrument_id_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'positions_snapshot_account_instrument_unique'
  ) THEN
    ALTER INDEX "positions_snapshot_id_account_id_instrument_id_key"
      RENAME TO "positions_snapshot_account_instrument_unique";
  END IF;
END $$;
