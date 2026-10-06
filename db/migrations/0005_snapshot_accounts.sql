-- 每个快照包含哪些账户（0 条持仓的账户也要有行）
-- 「每账户最新快照」只从这张表取，不再 UNION positions / cash_balances

CREATE TABLE IF NOT EXISTS "snapshot_accounts" (
  "snapshot_id" uuid NOT NULL REFERENCES "snapshots"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  PRIMARY KEY ("snapshot_id", "account_id")
);

INSERT INTO "snapshot_accounts" ("snapshot_id", "account_id")
SELECT DISTINCT "snapshot_id", "account_id" FROM "positions"
UNION
SELECT DISTINCT "snapshot_id", "account_id" FROM "cash_balances"
ON CONFLICT DO NOTHING;
