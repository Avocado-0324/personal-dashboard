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
 * 
 * 返回：{ accountId, snapshotId, asOf }[]
 */
export async function getLatestSnapshotsByAccount(): Promise<AccountSnapshot[]> {
  const db = getPoolDb();
  
  // 使用窗口函数为每个账户的每个快照排序
  const result = await db.execute<{
    account_id: string;
    snapshot_id: string;
    as_of: string;
    row_num: number;
  }>(sql`
    WITH ranked_snapshots AS (
      SELECT 
        p.account_id,
        p.snapshot_id,
        s.as_of,
        s.created_at,
        ROW_NUMBER() OVER (
          PARTITION BY p.account_id 
          ORDER BY s.as_of DESC, s.created_at DESC
        ) as row_num
      FROM positions p
      INNER JOIN snapshots s ON p.snapshot_id = s.id
    )
    SELECT 
      account_id,
      snapshot_id,
      as_of
    FROM ranked_snapshots
    WHERE row_num = 1
  `);
  
  return result.rows.map(row => ({
    accountId: row.account_id,
    snapshotId: row.snapshot_id,
    asOf: row.as_of,
  }));
}
