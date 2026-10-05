import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getPoolDb, isDatabaseConfigured } from '@/db/client';
import { accounts, snapshots, instruments, positions } from '@/db/schema';
import { getLatestPositionsByAccount } from '../queries';
import Decimal from 'decimal.js';
import { eq } from 'drizzle-orm';

/**
 * 测试场景：账户部分重叠的两份快照
 * 
 * S1 (2024-10-05)：账户 A, B, C, D
 * S2 (2024-10-06)：账户 A, B, C（覆盖了 A, B, C，D 保持在 S1）
 * 
 * 预期：
 * - A, B, C 应取 S2 的数据
 * - D 应取 S1 的数据
 * - 不应出现 S1 中 A, B, C 的旧数据（导致重复/翻倍）
 * 
 * 架构提供的复现数字：
 * - S2（10-06，无旧つみたて）日股 ¥6,561,424 + S1 留下的旧つみたて ¥328,637 = 正确 ¥6,890,061
 * - 错误实现会把 S1 四个账户整份 + S2 三个账户 → 约 ¥13,451,485（翻倍）
 */
describe('Portfolio Queries - Overlapping Snapshots', () => {
  let testDb: ReturnType<typeof getPoolDb>;
  let accountA: string;
  let accountB: string;
  let accountC: string;
  let accountD: string;
  let snapshotS1: string;
  let snapshotS2: string;
  let instrumentX: string;

  beforeAll(async () => {
    if (!isDatabaseConfigured()) {
      console.log('Database not configured, skipping integration tests');
      return;
    }

    testDb = getPoolDb();

    // 创建测试账户
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

    // 创建测试证券
    const [inst] = await testDb.insert(instruments).values({
      symbol: 'TEST',
      name: 'Test Stock',
      assetClass: 'jp_stock',
      currency: 'JPY',
      unitBasis: '1',
    }).returning();
    instrumentX = inst.id;

    // 创建 S1 快照 (2024-10-05) - 包含 A, B, C, D
    const [snapS1] = await testDb.insert(snapshots).values({
      asOf: '2024-10-05',
      source: 'csv',
    }).returning();
    snapshotS1 = snapS1.id;

    // S1 的持仓：每个账户 100 股 @ ¥100 = ¥10,000
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

    // 创建 S2 快照 (2024-10-06) - 只包含 A, B, C（覆盖）
    const [snapS2] = await testDb.insert(snapshots).values({
      asOf: '2024-10-06',
      source: 'csv',
    }).returning();
    snapshotS2 = snapS2.id;

    // S2 的持仓：A, B, C 各 200 股 @ ¥150 = ¥30,000
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
  });

  afterAll(async () => {
    if (!isDatabaseConfigured()) {
      return;
    }

    // 清理测试数据
    try {
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
    if (!isDatabaseConfigured()) {
      console.log('Skipping test: database not configured');
      return;
    }
    const allPositions = await getLatestPositionsByAccount();

    // 筛选出测试账户的持仓
    const testPositions = allPositions.filter(p => 
      [accountA, accountB, accountC, accountD].includes(p.position.accountId)
    );

    // 应该恰好 4 条（A, B, C, D 各一条）
    expect(testPositions.length).toBe(4);

    // A, B, C 应该来自 S2（200 股 @ ¥150）
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

    // D 应该来自 S1（100 股 @ ¥100）
    const posD = testPositions.find(p => p.position.accountId === accountD);
    expect(posD?.position.snapshotId).toBe(snapshotS1);
    expect(new Decimal(posD?.position.quantity || '0').equals(100)).toBe(true);
    expect(new Decimal(posD?.position.price || '0').equals(100)).toBe(true);

    // 计算总市值
    const totalValue = testPositions.reduce((sum, p) => {
      const qty = new Decimal(p.position.quantity);
      const price = new Decimal(p.position.price);
      const unitBasis = new Decimal(p.instrument.unitBasis);
      const fx = new Decimal(p.position.fxRateToJpy || '1');
      return sum.plus(qty.times(price).div(unitBasis).times(fx));
    }, new Decimal(0));

    // 预期：A, B, C 各 ¥30,000 + D ¥10,000 = ¥100,000
    expect(totalValue.toString()).toBe('100000');

    // 如果实现错误（取了 S1 全部 + S2 全部），总额会是：
    // S1: 4 * ¥10,000 = ¥40,000
    // S2: 3 * ¥30,000 = ¥90,000
    // 错误总额 = ¥130,000
    // 所以这个测试可以捕获重复问题
  });
});
