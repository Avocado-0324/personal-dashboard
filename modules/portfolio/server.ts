import { isDatabaseConfigured, getDb } from '@/db/client';
import { accounts, instruments, snapshots, positions, cashBalances, cashFlows } from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import Decimal from 'decimal.js';
import type { PortfolioData, PortfolioSummary } from './types';
import { calculateXIRR, isStale, type CashFlow } from './calculations';
import { ACCOUNT_TYPE_LABELS, ASSET_CLASS_LABELS } from './types';

export async function loadPortfolioData(): Promise<PortfolioData | null> {
  if (!isDatabaseConfigured()) {
    throw new Error('数据库未配置');
  }

  const db = getDb();

  // 获取所有账户的最新快照
  const latestSnapshots = await db
    .select({
      accountId: positions.accountId,
      snapshotId: positions.snapshotId,
      asOf: snapshots.asOf,
    })
    .from(positions)
    .innerJoin(snapshots, eq(positions.snapshotId, snapshots.id))
    .groupBy(positions.accountId, positions.snapshotId, snapshots.asOf)
    .orderBy(desc(snapshots.asOf));

  if (latestSnapshots.length === 0) {
    return null;
  }

  // 按账户分组，取每个账户最新的快照
  const accountLatestSnapshotMap = new Map<string, { snapshotId: string; asOf: string }>();
  for (const snap of latestSnapshots) {
    if (!accountLatestSnapshotMap.has(snap.accountId)) {
      accountLatestSnapshotMap.set(snap.accountId, {
        snapshotId: snap.snapshotId,
        asOf: snap.asOf,
      });
    }
  }

  const latestSnapshotIds = Array.from(accountLatestSnapshotMap.values()).map(s => s.snapshotId);
  const latestAsOf = latestSnapshots[0].asOf;

  // 获取这些快照的所有持仓
  const allPositions = await db
    .select({
      position: positions,
      account: accounts,
      instrument: instruments,
    })
    .from(positions)
    .innerJoin(accounts, eq(positions.accountId, accounts.id))
    .innerJoin(instruments, eq(positions.instrumentId, instruments.id))
    .where(sql`${positions.snapshotId} IN (${sql.join(latestSnapshotIds.map(id => sql`${id}`), sql`, `)})`);

  // 获取现金余额
  const allCashBalances = await db
    .select({
      cash: cashBalances,
      account: accounts,
    })
    .from(cashBalances)
    .innerJoin(accounts, eq(cashBalances.accountId, accounts.id))
    .where(sql`${cashBalances.snapshotId} IN (${sql.join(latestSnapshotIds.map(id => sql`${id}`), sql`, `)})`);

  // 获取所有现金流
  const allCashFlows = await db
    .select()
    .from(cashFlows)
    .orderBy(cashFlows.date);

  // 计算总市值
  let totalValue = new Decimal(0);
  const positionsByAccount = new Map<string, Decimal>();
  const positionsByAssetClass = new Map<string, Decimal>();
  const holdingsWithValue: Array<{
    symbol: string;
    name: string;
    value: Decimal;
    unrealizedPnl: Decimal;
    accountType: string;
  }> = [];
  let missingFxCount = 0;

  for (const { position, account, instrument } of allPositions) {
    const quantity = new Decimal(position.quantity);
    const price = new Decimal(position.price);
    const avgCost = new Decimal(position.avgCost);
    const fxRateRaw = position.fxRateToJpy;
    const unitBasis = new Decimal(instrument.unitBasis);

    // 缺汇率则跳过汇总
    if (!fxRateRaw || fxRateRaw === null) {
      missingFxCount++;
      continue;
    }

    const fxRate = new Decimal(fxRateRaw);

    // 计算市值：quantity * price / unitBasis * fxRate
    const value = quantity.times(price).div(unitBasis).times(fxRate);
    const unrealizedPnl = quantity.times(price.minus(avgCost)).div(unitBasis).times(fxRate);

    totalValue = totalValue.plus(value);

    // 按账户累加
    const accountTotal = positionsByAccount.get(account.type) || new Decimal(0);
    positionsByAccount.set(account.type, accountTotal.plus(value));

    // 按资产类别累加
    const assetClassTotal = positionsByAssetClass.get(instrument.assetClass) || new Decimal(0);
    positionsByAssetClass.set(instrument.assetClass, assetClassTotal.plus(value));

    holdingsWithValue.push({
      symbol: instrument.symbol,
      name: instrument.name,
      value,
      unrealizedPnl,
      accountType: account.type,
    });
  }

  // 加上现金
  let totalCash = new Decimal(0);
  for (const { cash, account } of allCashBalances) {
    const amount = new Decimal(cash.amount);
    const fxRateRaw = cash.fxRateToJpy;

    // 缺汇率则跳过
    if (!fxRateRaw || fxRateRaw === null) {
      missingFxCount++;
      continue;
    }

    const fxRate = new Decimal(fxRateRaw);
    const value = amount.times(fxRate);

    totalValue = totalValue.plus(value);
    totalCash = totalCash.plus(value);

    const accountTotal = positionsByAccount.get(account.type) || new Decimal(0);
    positionsByAccount.set(account.type, accountTotal.plus(value));
  }

  // 计算净投入
  let netContribution = new Decimal(0);
  for (const flow of allCashFlows) {
    const amount = new Decimal(flow.amountJpy);
    if (flow.direction === 'deposit') {
      netContribution = netContribution.plus(amount);
    } else {
      netContribution = netContribution.minus(amount);
    }
  }

  // 计算盈亏
  const pnl = totalValue.minus(netContribution);
  const pnlRatio = netContribution.gt(0) ? pnl.div(netContribution) : null;

  // 计算 XIRR
  const xirrFlows: CashFlow[] = allCashFlows.map(flow => ({
    date: new Date(flow.date),
    amount: flow.direction === 'deposit' 
      ? new Decimal(flow.amountJpy).neg() 
      : new Decimal(flow.amountJpy),
  }));
  
  // 加上终值
  xirrFlows.push({
    date: new Date(latestAsOf),
    amount: totalValue,
  });

  const xirr = calculateXIRR(xirrFlows);

  // 按账户分布（现金已在上面累加到账户 type 里）
  const allocationByAccount = Array.from(positionsByAccount.entries())
    .map(([type, value]) => ({
      accountType: type,
      label: ACCOUNT_TYPE_LABELS[type as keyof typeof ACCOUNT_TYPE_LABELS] || type,
      valueJpy: value.toFixed(0),
      ratio: totalValue.gt(0) ? value.div(totalValue).toFixed(4) : '0',
    }))
    .sort((a, b) => new Decimal(b.valueJpy).minus(new Decimal(a.valueJpy)).toNumber());

  // 按资产类别分布
  const allocationByAssetClass = Array.from(positionsByAssetClass.entries())
    .map(([assetClass, value]) => ({
      assetClass,
      label: ASSET_CLASS_LABELS[assetClass as keyof typeof ASSET_CLASS_LABELS] || assetClass,
      valueJpy: value.toFixed(0),
      ratio: totalValue.gt(0) ? value.div(totalValue).toFixed(4) : '0',
    }))
    .sort((a, b) => new Decimal(b.valueJpy).minus(new Decimal(a.valueJpy)).toNumber());

  // 现金单列一项到资产类别分布
  if (totalCash.gt(0)) {
    allocationByAssetClass.push({
      assetClass: 'cash',
      label: '现金',
      valueJpy: totalCash.toFixed(0),
      ratio: totalValue.gt(0) ? totalCash.div(totalValue).toFixed(4) : '0',
    });
  }

  // Top 持仓
  const topHoldings = holdingsWithValue
    .sort((a, b) => b.value.minus(a.value).toNumber())
    .slice(0, 5)
    .map(h => ({
      symbol: h.symbol,
      name: h.name,
      valueJpy: h.value.toFixed(0),
      unrealizedPnlJpy: h.unrealizedPnl.toFixed(0),
      pnlRatio: h.value.gt(0) ? h.unrealizedPnl.div(h.value.minus(h.unrealizedPnl)).toFixed(4) : '0',
      accountType: ACCOUNT_TYPE_LABELS[h.accountType as keyof typeof ACCOUNT_TYPE_LABELS] || h.accountType,
    }));

  return {
    asOf: latestAsOf,
    baseCurrency: 'JPY',
    totalJpy: totalValue.toFixed(0),
    netContributionJpy: netContribution.toFixed(0),
    pnlJpy: pnl.toFixed(0),
    pnlRatio: pnlRatio ? pnlRatio.toFixed(4) : null,
    xirr: xirr ? xirr.toFixed(4) : null,
    missingFxCount,
    allocationByAccount,
    allocationByAssetClass,
    topHoldings,
    stale: isStale(new Date(latestAsOf)),
  };
}

export async function loadSummary(): Promise<PortfolioSummary | null> {
  const data = await loadPortfolioData();
  if (!data) return null;

  return {
    totalJpy: data.totalJpy,
    pnlJpy: data.pnlJpy,
    xirr: data.xirr,
    asOf: data.asOf,
    missingFxCount: data.missingFxCount,
  };
}
