/**
 * Portfolio 查询工具函数
 */

import { getPoolDb } from '@/db/client';
import { snapshots, accounts } from '@/db/schema';
import { sql } from 'drizzle-orm';

export type AccountSnapshot = {
  accountId: string;
  snapshotId: string;
  asOf: string;
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
