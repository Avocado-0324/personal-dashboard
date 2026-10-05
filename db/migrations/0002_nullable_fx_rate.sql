-- Migration: Make fxRateToJpy nullable

ALTER TABLE "positions" ALTER COLUMN "fx_rate_to_jpy" DROP NOT NULL;
ALTER TABLE "positions" ALTER COLUMN "fx_rate_to_jpy" DROP DEFAULT;

ALTER TABLE "cash_balances" ALTER COLUMN "fx_rate_to_jpy" DROP NOT NULL;
ALTER TABLE "cash_balances" ALTER COLUMN "fx_rate_to_jpy" DROP DEFAULT;
