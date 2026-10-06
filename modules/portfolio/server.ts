import { isDatabaseConfigured, getDb } from '@/db/client';
import { cashFlows } from '@/db/schema';
import Decimal from 'decimal.js';
import type { PortfolioData, PortfolioSummary } from './types';
import { calculateXIRR, isStale, marketValueJpyFloor, cashValueJpyFloor, unrealizedPnlJpyFloor, type CashFlow } from './calculations';
import { ASSET_CLASS_LABELS } from './types';
import {
  getLatestSnapshotsByAccount,
  getLatestPositionsByAccount,
  getLatestCashBalancesByAccount,
} from './queries';
import {
  mergeHoldingsByInstrument,
  formatAccountBreakdown,
  formatAsOfRangeLabel,
  buildTaxAllocation,
  type HoldingForMerge,
} from './display';

export async function loadPortfolioData(): Promise<PortfolioData | null> {
  if (!isDatabaseConfigured()) {
    throw new Error('数据库未配置');
  }

  const db = getDb();

  const accountSnapshots = await getLatestSnapshotsByAccount();

  if (accountSnapshots.length === 0) {
    return null;
  }

  const latestAsOf = accountSnapshots
    .map(s => s.asOf)
    .sort()
    .reverse()[0];
  const asOfRangeLabel = formatAsOfRangeLabel(accountSnapshots.map(s => s.asOf));

  const allPositions = await getLatestPositionsByAccount();
  const allCashBalances = await getLatestCashBalancesByAccount();

  const allCashFlows = await db
    .select()
    .from(cashFlows)
    .orderBy(cashFlows.date);

  let totalValue = new Decimal(0);
  const positionsByAssetClass = new Map<string, Decimal>();
  const holdingsForMerge: HoldingForMerge[] = [];
  const taxHoldings: Array<{ accountType: string; value: Decimal }> = [];
  let missingFxCount = 0;

  for (const { position, account, instrument } of allPositions) {
    const fxRateRaw = position.fxRateToJpy;

    if (!fxRateRaw || fxRateRaw === null) {
      missingFxCount++;
      continue;
    }

    const value = marketValueJpyFloor({
      quantity: position.quantity,
      price: position.price,
      unitBasis: instrument.unitBasis,
      fxRateToJpy: fxRateRaw,
    });

    const unrealizedPnl = unrealizedPnlJpyFloor({
      quantity: position.quantity,
      price: position.price,
      avgCost: position.avgCost,
      unitBasis: instrument.unitBasis,
      fxRateToJpy: fxRateRaw,
    });

    totalValue = totalValue.plus(value);

    const assetClassTotal = positionsByAssetClass.get(instrument.assetClass) || new Decimal(0);
    positionsByAssetClass.set(instrument.assetClass, assetClassTotal.plus(value));

    taxHoldings.push({ accountType: account.type, value });
    holdingsForMerge.push({
      symbol: instrument.symbol,
      name: instrument.name,
      currency: instrument.currency,
      assetClass: instrument.assetClass,
      value,
      unrealizedPnl,
      accountType: account.type,
      quantity: position.quantity,
    });
  }

  let totalCash = new Decimal(0);
  for (const { cash } of allCashBalances) {
    const fxRateRaw = cash.fxRateToJpy;

    if (!fxRateRaw || fxRateRaw === null) {
      missingFxCount++;
      continue;
    }

    const value = cashValueJpyFloor({
      amount: cash.amount,
      fxRateToJpy: fxRateRaw,
    });

    totalValue = totalValue.plus(value);
    totalCash = totalCash.plus(value);
  }

  let netContribution = new Decimal(0);
  for (const flow of allCashFlows) {
    const amount = new Decimal(flow.amountJpy);
    if (flow.direction === 'deposit') {
      netContribution = netContribution.plus(amount);
    } else {
      netContribution = netContribution.minus(amount);
    }
  }

  const pnl = totalValue.minus(netContribution);
  const pnlRatio = netContribution.gt(0) ? pnl.div(netContribution) : null;

  const xirrFlows: CashFlow[] = allCashFlows.map(flow => ({
    date: new Date(flow.date),
    amount: flow.direction === 'deposit'
      ? new Decimal(flow.amountJpy).neg()
      : new Decimal(flow.amountJpy),
  }));

  xirrFlows.push({
    date: new Date(latestAsOf),
    amount: totalValue,
  });

  const xirr = calculateXIRR(xirrFlows);

  const allocationByAccount = buildTaxAllocation({
    holdings: taxHoldings,
    cashTotal: totalCash,
    totalValue,
  });

  const allocationByAssetClass = Array.from(positionsByAssetClass.entries())
    .map(([assetClass, value]) => ({
      assetClass,
      label: ASSET_CLASS_LABELS[assetClass as keyof typeof ASSET_CLASS_LABELS] || assetClass,
      valueJpy: value.toFixed(0),
      ratio: totalValue.gt(0) ? value.div(totalValue).toFixed(4) : '0',
    }))
    .sort((a, b) => new Decimal(b.valueJpy).minus(new Decimal(a.valueJpy)).toNumber());

  if (totalCash.gt(0)) {
    allocationByAssetClass.push({
      assetClass: 'cash',
      label: '现金',
      valueJpy: totalCash.toFixed(0),
      ratio: totalValue.gt(0) ? totalCash.div(totalValue).toFixed(4) : '0',
    });
  }

  const topHoldings = mergeHoldingsByInstrument(holdingsForMerge)
    .slice(0, 5)
    .map(h => ({
      symbol: h.symbol,
      name: h.name,
      assetClass: h.assetClass,
      currency: h.currency,
      valueJpy: h.value.toFixed(0),
      unrealizedPnlJpy: h.unrealizedPnl.toFixed(0),
      pnlRatio: (() => {
        const cost = h.value.minus(h.unrealizedPnl);
        return cost.gt(0) ? h.unrealizedPnl.div(cost).toFixed(4) : '0';
      })(),
      accountBreakdown: formatAccountBreakdown(h.tokuteiQty, h.nisaQty),
    }));

  return {
    asOf: latestAsOf,
    asOfRangeLabel,
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
    asOfRangeLabel: data.asOfRangeLabel,
    missingFxCount: data.missingFxCount,
  };
}
