import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getPoolDb } from '@/db/client';
import { accounts, snapshots, instruments, positions, snapshotAccounts } from '@/db/schema';
import { getLatestPositionsByAccount, getLatestSnapshotsByAccount } from '../queries';
import Decimal from 'decimal.js';
import { eq } from 'drizzle-orm';

/**
 * 集成测只认 TEST_DATABASE_URL，没有就 skip，避免误连生产库。
 *
 * 场景：账户部分重叠的两份快照
 * S1 (2024-10-05)：账户 A, B, C, D
 * S2 (2024-10-06)：账户 A, B, C（覆盖了 A, B, C，D 保持在 S1）
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

describeDb('Portfolio Queries - Overlapping Snapshots', () => {
  let testDb: ReturnType<typeof getPoolDb>;
  let accountA: string;
  let accountB: string;
  let accountC: string;
  let accountD: string;
  let snapshotS1: string;
  let snapshotS2: string;
  let snapshotS3: string | undefined;
  let instrumentX: string;

  beforeAll(async () => {
    testDb = getPoolDb();

    const [accA] = await testDb.insert(accounts).values({
      name: 'Test Account A',
      type: 'tokutei',
    }).returning();
    accountA = accA.id;

    const [accB] = await testDb.insert(accounts).values({
      name: 'Test Account B',
      type: 'tokutei',
    }).returning();
    accountB = accB.id;

    const [accC] = await testDb.insert(accounts).values({
      name: 'Test Account C',
      type: 'tokutei',
    }).returning();
    accountC = accC.id;

    const [accD] = await testDb.insert(accounts).values({
      name: 'Test Account D',
      type: 'tokutei',
    }).returning();
    accountD = accD.id;

    const [inst] = await testDb.insert(instruments).values({
      symbol: 'TEST',
      name: 'Test Stock',
      assetClass: 'jp_stock',
      currency: 'JPY',
      unitBasis: '1',
    }).returning();
    instrumentX = inst.id;

    const [snapS1] = await testDb.insert(snapshots).values({
      asOf: '2024-10-05',
      source: 'csv',
    }).returning();
    snapshotS1 = snapS1.id;

    await testDb.insert(positions).values([
      {
        snapshotId: snapshotS1,
        accountId: accountA,
        instrumentId: instrumentX,
        quantity: '100',
        avgCost: '100',
        price: '100',
        fxRateToJpy: '1',
      },
      {
        snapshotId: snapshotS1,
        accountId: accountB,
        instrumentId: instrumentX,
        quantity: '100',
        avgCost: '100',
        price: '100',
        fxRateToJpy: '1',
      },
      {
        snapshotId: snapshotS1,
        accountId: accountC,
        instrumentId: instrumentX,
        quantity: '100',
        avgCost: '100',
        price: '100',
        fxRateToJpy: '1',
      },
      {
        snapshotId: snapshotS1,
        accountId: accountD,
        instrumentId: instrumentX,
        quantity: '100',
        avgCost: '100',
        price: '100',
        fxRateToJpy: '1',
      },
    ]);

    await testDb.insert(snapshotAccounts).values([
      { snapshotId: snapshotS1, accountId: accountA },
      { snapshotId: snapshotS1, accountId: accountB },
      { snapshotId: snapshotS1, accountId: accountC },
      { snapshotId: snapshotS1, accountId: accountD },
    ]);

    const [snapS2] = await testDb.insert(snapshots).values({
      asOf: '2024-10-06',
      source: 'csv',
    }).returning();
    snapshotS2 = snapS2.id;

    await testDb.insert(positions).values([
      {
        snapshotId: snapshotS2,
        accountId: accountA,
        instrumentId: instrumentX,
        quantity: '200',
        avgCost: '150',
        price: '150',
        fxRateToJpy: '1',
      },
      {
        snapshotId: snapshotS2,
        accountId: accountB,
        instrumentId: instrumentX,
        quantity: '200',
        avgCost: '150',
        price: '150',
        fxRateToJpy: '1',
      },
      {
        snapshotId: snapshotS2,
        accountId: accountC,
        instrumentId: instrumentX,
        quantity: '200',
        avgCost: '150',
        price: '150',
        fxRateToJpy: '1',
      },
    ]);

    await testDb.insert(snapshotAccounts).values([
      { snapshotId: snapshotS2, accountId: accountA },
      { snapshotId: snapshotS2, accountId: accountB },
      { snapshotId: snapshotS2, accountId: accountC },
    ]);
  });

  afterAll(async () => {
    try {
      if (snapshotS3) {
        await testDb.delete(snapshots).where(eq(snapshots.id, snapshotS3));
      }
      if (snapshotS1) {
        await testDb.delete(positions).where(eq(positions.snapshotId, snapshotS1));
        await testDb.delete(snapshots).where(eq(snapshots.id, snapshotS1));
      }
      if (snapshotS2) {
        await testDb.delete(positions).where(eq(positions.snapshotId, snapshotS2));
        await testDb.delete(snapshots).where(eq(snapshots.id, snapshotS2));
      }
      if (instrumentX) {
        await testDb.delete(instruments).where(eq(instruments.id, instrumentX));
      }
      if (accountA) await testDb.delete(accounts).where(eq(accounts.id, accountA));
      if (accountB) await testDb.delete(accounts).where(eq(accounts.id, accountB));
      if (accountC) await testDb.delete(accounts).where(eq(accounts.id, accountC));
      if (accountD) await testDb.delete(accounts).where(eq(accounts.id, accountD));
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  it('应该只取每个账户最新快照的持仓，不重复旧数据', async () => {
    const allPositions = await getLatestPositionsByAccount();

    const testPositions = allPositions.filter(p =>
      [accountA, accountB, accountC, accountD].includes(p.position.accountId)
    );

    expect(testPositions.length).toBe(4);

    const posA = testPositions.find(p => p.position.accountId === accountA);
    expect(posA?.position.snapshotId).toBe(snapshotS2);
    expect(new Decimal(posA?.position.quantity || '0').equals(200)).toBe(true);
    expect(new Decimal(posA?.position.price || '0').equals(150)).toBe(true);

    const posB = testPositions.find(p => p.position.accountId === accountB);
    expect(posB?.position.snapshotId).toBe(snapshotS2);
    expect(new Decimal(posB?.position.quantity || '0').equals(200)).toBe(true);

    const posC = testPositions.find(p => p.position.accountId === accountC);
    expect(posC?.position.snapshotId).toBe(snapshotS2);
    expect(new Decimal(posC?.position.quantity || '0').equals(200)).toBe(true);

    const posD = testPositions.find(p => p.position.accountId === accountD);
    expect(posD?.position.snapshotId).toBe(snapshotS1);
    expect(new Decimal(posD?.position.quantity || '0').equals(100)).toBe(true);
    expect(new Decimal(posD?.position.price || '0').equals(100)).toBe(true);

    const totalValue = testPositions.reduce((sum, p) => {
      const qty = new Decimal(p.position.quantity);
      const price = new Decimal(p.position.price);
      const unitBasis = new Decimal(p.instrument.unitBasis);
      const fx = new Decimal(p.position.fxRateToJpy || '1');
      return sum.plus(qty.times(price).div(unitBasis).times(fx));
    }, new Decimal(0));

    expect(totalValue.toString()).toBe('100000');
  });

  it('最新快照 0 条持仓的账户不回退显示旧快照持仓', async () => {
    const [snapS3] = await testDb.insert(snapshots).values({
      asOf: '2024-10-07',
      source: 'csv',
    }).returning();
    snapshotS3 = snapS3.id;

    await testDb.insert(snapshotAccounts).values({
      snapshotId: snapshotS3,
      accountId: accountD,
    });

    const latest = await getLatestSnapshotsByAccount();
    const dSnap = latest.find(s => s.accountId === accountD);
    expect(dSnap?.snapshotId).toBe(snapshotS3);

    const allPositions = await getLatestPositionsByAccount();
    const posD = allPositions.filter(p => p.position.accountId === accountD);
    expect(posD.length).toBe(0);
  });
});
