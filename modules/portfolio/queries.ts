/**
 * Portfolio 查询工具函数
 */

import { getPoolDb } from '@/db/client';
import { snapshots, accounts, positions, instruments, cashBalances } from '@/db/schema';
import { sql } from 'drizzle-orm';

export type AccountSnapshot = {
  accountId: string;
  snapshotId: string;
  asOf: string;
};

export type PositionWithRelations = {
  position: typeof positions.$inferSelect;
  account: typeof accounts.$inferSelect;
  instrument: typeof instruments.$inferSelect;
};

export type CashBalanceWithRelations = {
  cash: typeof cashBalances.$inferSelect;
  account: typeof accounts.$inferSelect;
};

/**
 * 获取每个账户的最新快照信息
 * 
 * 策略：
 * - 每个账户各自取最新快照（按 as_of DESC, created_at DESC）
 * - 同一天多个快照时按 created_at 取最新
 * - 支持多个账户各自有不同日期的快照
 * - 同时考虑 positions 和 cash_balances（避免只有现金更新的账户取不到）
 * 
 * 返回：{ accountId, snapshotId, asOf }[]
 */
export async function getLatestSnapshotsByAccount(): Promise<AccountSnapshot[]> {
  const db = getPoolDb();
  
  // 使用窗口函数为每个账户的每个快照排序
  // UNION positions 和 cash_balances 以覆盖所有账户快照
  const result = await db.execute<{
    account_id: string;
    snapshot_id: string;
    as_of: string;
    row_num: number;
  }>(sql`
    WITH all_account_snapshots AS (
      SELECT DISTINCT
        p.account_id,
        p.snapshot_id,
        s.as_of,
        s.created_at
      FROM positions p
      INNER JOIN snapshots s ON p.snapshot_id = s.id
      
      UNION
      
      SELECT DISTINCT
        cb.account_id,
        cb.snapshot_id,
        s.as_of,
        s.created_at
      FROM cash_balances cb
      INNER JOIN snapshots s ON cb.snapshot_id = s.id
    ),
    ranked_snapshots AS (
      SELECT 
        account_id,
        snapshot_id,
        as_of,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY account_id 
          ORDER BY as_of DESC, created_at DESC
        ) as row_num
      FROM all_account_snapshots
    )
    SELECT 
      account_id,
      snapshot_id,
      as_of::text AS as_of
    FROM ranked_snapshots
    WHERE row_num = 1
  `);
  
  return result.rows.map(row => ({
    accountId: row.account_id,
    snapshotId: row.snapshot_id,
    asOf: row.as_of,
  }));
}

/**
 * 获取每个账户最新快照的所有持仓
 * 
 * 关键：按 (accountId, snapshotId) 配对查询，避免取到旧快照中已被覆盖账户的数据
 * 
 * 场景：
 * - S1 包含账户 A, B, C, D
 * - S2 只包含账户 A, B, C（覆盖了 A, B, C）
 * - 结果应为：A, B, C 来自 S2，D 来自 S1
 * - 不应取到 S1 中 A, B, C 的旧数据
 */
export async function getLatestPositionsByAccount(): Promise<PositionWithRelations[]> {
  const db = getPoolDb();
  
  const result = await db.execute<{
    position_id: string;
    position_snapshot_id: string;
    position_account_id: string;
    position_instrument_id: string;
    position_quantity: string;
    position_avg_cost: string;
    position_price: string;
    position_fx_rate_to_jpy: string | null;
    account_id: string;
    account_name: string;
    account_type: string;
    account_broker: string | null;
    account_created_at: string;
    instrument_id: string;
    instrument_symbol: string;
    instrument_name: string;
    instrument_asset_class: string;
    instrument_currency: string;
    instrument_unit_basis: string;
  }>(sql`
    WITH latest_snapshots AS (
      SELECT DISTINCT
        p.account_id,
        p.snapshot_id,
        s.as_of,
        s.created_at
      FROM positions p
      INNER JOIN snapshots s ON p.snapshot_id = s.id
      
      UNION
      
      SELECT DISTINCT
        cb.account_id,
        cb.snapshot_id,
        s.as_of,
        s.created_at
      FROM cash_balances cb
      INNER JOIN snapshots s ON cb.snapshot_id = s.id
    ),
    ranked_snapshots AS (
      SELECT 
        account_id,
        snapshot_id,
        as_of,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY account_id 
          ORDER BY as_of DESC, created_at DESC
        ) as row_num
      FROM latest_snapshots
    ),
    latest_account_snapshots AS (
      SELECT account_id, snapshot_id
      FROM ranked_snapshots
      WHERE row_num = 1
    )
    SELECT 
      p.id as position_id,
      p.snapshot_id as position_snapshot_id,
      p.account_id as position_account_id,
      p.instrument_id as position_instrument_id,
      p.quantity as position_quantity,
      p.avg_cost as position_avg_cost,
      p.price as position_price,
      p.fx_rate_to_jpy as position_fx_rate_to_jpy,
      a.id as account_id,
      a.name as account_name,
      a.type as account_type,
      a.broker as account_broker,
      a.created_at::text as account_created_at,
      i.id as instrument_id,
      i.symbol as instrument_symbol,
      i.name as instrument_name,
      i.asset_class as instrument_asset_class,
      i.currency as instrument_currency,
      i.unit_basis as instrument_unit_basis
    FROM positions p
    INNER JOIN latest_account_snapshots las 
      ON p.account_id = las.account_id AND p.snapshot_id = las.snapshot_id
    INNER JOIN accounts a ON p.account_id = a.id
    INNER JOIN instruments i ON p.instrument_id = i.id
  `);
  
  return result.rows.map(row => ({
    position: {
      id: row.position_id,
      snapshotId: row.position_snapshot_id,
      accountId: row.position_account_id,
      instrumentId: row.position_instrument_id,
      quantity: row.position_quantity,
      avgCost: row.position_avg_cost,
      price: row.position_price,
      fxRateToJpy: row.position_fx_rate_to_jpy,
    },
    account: {
      id: row.account_id,
      name: row.account_name,
      type: row.account_type as any,
      broker: row.account_broker,
      createdAt: new Date(row.account_created_at),
    },
    instrument: {
      id: row.instrument_id,
      symbol: row.instrument_symbol,
      name: row.instrument_name,
      assetClass: row.instrument_asset_class as any,
      currency: row.instrument_currency as any,
      unitBasis: row.instrument_unit_basis,
    },
  }));
}

/**
 * 获取每个账户最新快照的所有现金余额
 * 
 * 同样按 (accountId, snapshotId) 配对查询
 */
export async function getLatestCashBalancesByAccount(): Promise<CashBalanceWithRelations[]> {
  const db = getPoolDb();
  
  const result = await db.execute<{
    cash_id: string;
    cash_snapshot_id: string;
    cash_account_id: string;
    cash_currency: string;
    cash_amount: string;
    cash_fx_rate_to_jpy: string | null;
    account_id: string;
    account_name: string;
    account_type: string;
    account_broker: string | null;
    account_created_at: string;
  }>(sql`
    WITH latest_snapshots AS (
      SELECT DISTINCT
        p.account_id,
        p.snapshot_id,
        s.as_of,
        s.created_at
      FROM positions p
      INNER JOIN snapshots s ON p.snapshot_id = s.id
      
      UNION
      
      SELECT DISTINCT
        cb.account_id,
        cb.snapshot_id,
        s.as_of,
        s.created_at
      FROM cash_balances cb
      INNER JOIN snapshots s ON cb.snapshot_id = s.id
    ),
    ranked_snapshots AS (
      SELECT 
        account_id,
        snapshot_id,
        as_of,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY account_id 
          ORDER BY as_of DESC, created_at DESC
        ) as row_num
      FROM latest_snapshots
    ),
    latest_account_snapshots AS (
      SELECT account_id, snapshot_id
      FROM ranked_snapshots
      WHERE row_num = 1
    )
    SELECT 
      cb.id as cash_id,
      cb.snapshot_id as cash_snapshot_id,
      cb.account_id as cash_account_id,
      cb.currency as cash_currency,
      cb.amount as cash_amount,
      cb.fx_rate_to_jpy as cash_fx_rate_to_jpy,
      a.id as account_id,
      a.name as account_name,
      a.type as account_type,
      a.broker as account_broker,
      a.created_at::text as account_created_at
    FROM cash_balances cb
    INNER JOIN latest_account_snapshots las 
      ON cb.account_id = las.account_id AND cb.snapshot_id = las.snapshot_id
    INNER JOIN accounts a ON cb.account_id = a.id
  `);
  
  return result.rows.map(row => ({
    cash: {
      id: row.cash_id,
      snapshotId: row.cash_snapshot_id,
      accountId: row.cash_account_id,
      currency: row.cash_currency as any,
      amount: row.cash_amount,
      fxRateToJpy: row.cash_fx_rate_to_jpy,
    },
    account: {
      id: row.account_id,
      name: row.account_name,
      type: row.account_type as any,
      broker: row.account_broker,
      createdAt: new Date(row.account_created_at),
    },
  }));
}
