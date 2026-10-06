import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getPoolDb } from '@/db/client';
import { accounts, snapshots, instruments, positions, snapshotAccounts, cashBalances } from '@/db/schema';
import { getLatestPositionsByAccount, getLatestCashBalancesByAccount } from '../queries';
import { isTargetInSameSnapshot, movePositionToAccount, MOVE_NOT_IN_SNAPSHOT_ERROR, MOVE_DUPLICATE_INSTRUMENT_ERROR, hasSameInstrumentInTarget, isUniqueConstraintError } from '../move-position';
import { eq } from 'drizzle-orm';

describe('isTargetInSameSnapshot', () => {
  it('只允许移到同一份快照里已有的账户', () => {
    const members = [
      { snapshotId: 'snap-jp', accountId: 'acct-sbi' },
      { snapshotId: 'snap-jp', accountId: 'acct-nisa' },
      { snapshotId: 'snap-us', accountId: 'acct-us' },
    ];
    expect(isTargetInSameSnapshot('snap-jp', 'acct-nisa', members)).toBe(true);
    expect(isTargetInSameSnapshot('snap-jp', 'acct-us', members)).toBe(false);
  });
});

describe('duplicate instrument conflict', () => {
  it('目标账户已有同一 instrument 时判定冲突', () => {
    expect(hasSameInstrumentInTarget([{ instrumentId: 'inst-a' }], 'inst-a')).toBe(true);
    expect(hasSameInstrumentInTarget([{ instrumentId: 'inst-b' }], 'inst-a')).toBe(false);
    expect(hasSameInstrumentInTarget([], 'inst-a')).toBe(false);
  });

  it('409 文案固定为 目标账户已持有这只标的', () => {
    expect(MOVE_DUPLICATE_INSTRUMENT_ERROR).toBe('目标账户已持有这只标的');
  });

  it('并发唯一约束只认 23505，不比对约束名', () => {
    expect(isUniqueConstraintError({ code: '23505' })).toBe(true);
    expect(isUniqueConstraintError({
      code: '23505',
      constraint: 'positions_snapshot_id_account_id_instrument_id_key',
    })).toBe(true);
    expect(isUniqueConstraintError({
      message: 'wrapped',
      cause: { code: '23505', constraint: 'anything' },
    })).toBe(true);
    expect(isUniqueConstraintError({
      code: '23503',
      constraint: 'positions_snapshot_account_instrument_unique',
    })).toBe(false);
    expect(isUniqueConstraintError({ cause: { code: '23503' } })).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
  });
});

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

describeDb('movePositionToAccount integration', () => {
  let db: ReturnType<typeof getPoolDb>;
  let jpAccount: string;
  let usAccount: string;
  let snapJp: string;
  let snapUs: string;
  let jpPosition: string;
  let usPosition: string;
  let instrumentJp: string;
  let instrumentUs: string;

  beforeAll(async () => {
    db = getPoolDb();

    const [jp] = await db.insert(accounts).values({ name: 'MoveTest SBI 特定', type: 'tokutei' }).returning();
    const [us] = await db.insert(accounts).values({ name: 'MoveTest 米国株 特定', type: 'tokutei' }).returning();
    jpAccount = jp.id;
    usAccount = us.id;

    const [instJp] = await db.insert(instruments).values({
      symbol: 'MOVETEST-JP',
      name: 'Move Test JP',
      assetClass: 'jp_stock',
      currency: 'JPY',
      unitBasis: '1',
    }).returning();
    const [instUs] = await db.insert(instruments).values({
      symbol: 'MOVETEST-US',
      name: 'Move Test US',
      assetClass: 'us_stock',
      currency: 'USD',
      unitBasis: '1',
    }).returning();
    instrumentJp = instJp.id;
    instrumentUs = instUs.id;

    const [sJp] = await db.insert(snapshots).values({ asOf: '2024-10-05', source: 'csv' }).returning();
    const [sUs] = await db.insert(snapshots).values({ asOf: '2024-10-02', source: 'manual' }).returning();
    snapJp = sJp.id;
    snapUs = sUs.id;

    await db.insert(snapshotAccounts).values([
      { snapshotId: snapJp, accountId: jpAccount },
      { snapshotId: snapUs, accountId: usAccount },
    ]);

    const [posJp] = await db.insert(positions).values({
      snapshotId: snapJp,
      accountId: jpAccount,
      instrumentId: instrumentJp,
      quantity: '10',
      avgCost: '100',
      price: '110',
      fxRateToJpy: '1',
    }).returning();
    const [posUs] = await db.insert(positions).values({
      snapshotId: snapUs,
      accountId: usAccount,
      instrumentId: instrumentUs,
      quantity: '5',
      avgCost: '100',
      price: '120',
      fxRateToJpy: '150',
    }).returning();
    jpPosition = posJp.id;
    usPosition = posUs.id;

    await db.insert(cashBalances).values({
      snapshotId: snapUs,
      accountId: usAccount,
      currency: 'USD',
      amount: '200',
      fxRateToJpy: '150',
    });
  });

  afterAll(async () => {
    try {
      if (snapJp) await db.delete(snapshots).where(eq(snapshots.id, snapJp));
      if (snapUs) await db.delete(snapshots).where(eq(snapshots.id, snapUs));
      if (instrumentJp) await db.delete(instruments).where(eq(instruments.id, instrumentJp));
      if (instrumentUs) await db.delete(instruments).where(eq(instruments.id, instrumentUs));
      if (jpAccount) await db.delete(accounts).where(eq(accounts.id, jpAccount));
      if (usAccount) await db.delete(accounts).where(eq(accounts.id, usAccount));
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  it('移到不在同一快照的账户时返回 409，且两侧读数不变', async () => {
    const beforePositions = await getLatestPositionsByAccount();
    const beforeCash = await getLatestCashBalancesByAccount();
    const jpBefore = beforePositions.filter(p => p.position.accountId === jpAccount);
    const usBefore = beforePositions.filter(p => p.position.accountId === usAccount);
    const usCashBefore = beforeCash.filter(c => c.cash.accountId === usAccount);

    const result = await db.transaction(async (tx) => {
      return movePositionToAccount(tx, jpPosition, usAccount);
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toBe(MOVE_NOT_IN_SNAPSHOT_ERROR);
    }

    const afterPositions = await getLatestPositionsByAccount();
    const afterCash = await getLatestCashBalancesByAccount();
    const jpAfter = afterPositions.filter(p => p.position.accountId === jpAccount);
    const usAfter = afterPositions.filter(p => p.position.accountId === usAccount);
    const usCashAfter = afterCash.filter(c => c.cash.accountId === usAccount);

    expect(jpAfter.map(p => p.position.id).sort()).toEqual(jpBefore.map(p => p.position.id).sort());
    expect(usAfter.map(p => p.position.id).sort()).toEqual(usBefore.map(p => p.position.id).sort());
    expect(usCashAfter.map(c => c.cash.id).sort()).toEqual(usCashBefore.map(c => c.cash.id).sort());
    expect(jpAfter[0]?.position.snapshotId).toBe(snapJp);
    expect(usAfter[0]?.position.snapshotId).toBe(snapUs);
    expect(usAfter.some(p => p.position.id === jpPosition)).toBe(false);
    expect(usPosition).toBeTruthy();
  });
});
