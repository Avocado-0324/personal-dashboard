import { describe, it, expect } from '@jest/globals';
import { primaryKey } from 'drizzle-orm/pg-core';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { snapshotAccounts } from '@/db/schema';

describe('snapshot_accounts schema', () => {
  it('使用复合主键，而不是单独的 uniqueIndex', () => {
    const config = getTableConfig(snapshotAccounts);
    expect(config.primaryKeys.length).toBe(1);
    expect(config.primaryKeys[0].columns.map(c => c.name).sort()).toEqual(['account_id', 'snapshot_id']);
    expect(config.uniqueConstraints?.length ?? 0).toBe(0);
  });

  it('primaryKey helper 可用', () => {
    expect(typeof primaryKey).toBe('function');
  });
});
