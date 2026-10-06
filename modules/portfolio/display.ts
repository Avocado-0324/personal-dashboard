import Decimal from 'decimal.js';
import type { AccountType, AssetClass } from './types';

export type HoldingForMerge = {
  symbol: string;
  name: string;
  currency: string;
  assetClass: string;
  value: Decimal;
  unrealizedPnl: Decimal;
  accountType: string;
};

export type MergedHolding = {
  symbol: string;
  name: string;
  currency: string;
  assetClass: string;
  value: Decimal;
  unrealizedPnl: Decimal;
  tokuteiCount: number;
  nisaCount: number;
};

export function formatAsOfMd(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  return `${Number(match[2])}月${Number(match[3])}日`;
}

export function formatAsOfRangeLabel(asOfDates: string[]): string | null {
  const unique = [...new Set(asOfDates.map(d => d.slice(0, 10)).filter(Boolean))].sort();
  if (unique.length <= 1) return null;
  return `数据日期 ${formatAsOfMd(unique[0])}–${formatAsOfMd(unique[unique.length - 1])}`;
}

export function formatAccountBreakdown(tokuteiCount: number, nisaCount: number): string {
  const parts: string[] = [];
  if (tokuteiCount > 0) parts.push(`特定 ${tokuteiCount}`);
  if (nisaCount > 0) parts.push(`NISA ${nisaCount}`);
  return parts.join(' · ');
}

function isNisaType(accountType: string): boolean {
  return accountType === 'nisa_growth' || accountType === 'nisa_tsumitate';
}

export function mergeHoldingsByInstrument(holdings: HoldingForMerge[]): MergedHolding[] {
  const merged = new Map<string, MergedHolding>();

  for (const holding of holdings) {
    const key = `${holding.symbol}\0${holding.currency}`;
    const existing = merged.get(key);
    const tokuteiInc = holding.accountType === 'tokutei' ? 1 : 0;
    const nisaInc = isNisaType(holding.accountType) ? 1 : 0;

    if (!existing) {
      merged.set(key, {
        symbol: holding.symbol,
        name: holding.name,
        currency: holding.currency,
        assetClass: holding.assetClass,
        value: holding.value,
        unrealizedPnl: holding.unrealizedPnl,
        tokuteiCount: tokuteiInc,
        nisaCount: nisaInc,
      });
      continue;
    }

    existing.value = existing.value.plus(holding.value);
    existing.unrealizedPnl = existing.unrealizedPnl.plus(holding.unrealizedPnl);
    existing.tokuteiCount += tokuteiInc;
    existing.nisaCount += nisaInc;
  }

  return Array.from(merged.values()).sort((a, b) => b.value.minus(a.value).toNumber());
}

export function isUsStock(assetClass: string): boolean {
  return assetClass === 'us_stock';
}

export const TAX_ALLOCATION_ORDER = ['nisa', 'tokutei', 'cash'] as const;
export type TaxAllocationKey = (typeof TAX_ALLOCATION_ORDER)[number];

export const TAX_ALLOCATION_LABELS: Record<TaxAllocationKey, string> = {
  nisa: 'NISA',
  tokutei: '特定',
  cash: '现金',
};

export function taxBucketForAccountType(accountType: string): Exclude<TaxAllocationKey, 'cash'> | null {
  if (isNisaType(accountType)) return 'nisa';
  if (accountType === 'tokutei' || accountType === 'other' || accountType === 'cash') return 'tokutei';
  return null;
}

export function buildTaxAllocation(params: {
  holdings: Array<{ accountType: string; value: Decimal }>;
  cashTotal: Decimal;
  totalValue: Decimal;
}): Array<{ accountType: string; label: string; valueJpy: string; ratio: string }> {
  const buckets: Record<TaxAllocationKey, Decimal> = {
    nisa: new Decimal(0),
    tokutei: new Decimal(0),
    cash: params.cashTotal,
  };

  for (const holding of params.holdings) {
    const bucket = taxBucketForAccountType(holding.accountType);
    if (!bucket) continue;
    buckets[bucket] = buckets[bucket].plus(holding.value);
  }

  return TAX_ALLOCATION_ORDER
    .map(key => {
      const value = buckets[key];
      return {
        accountType: key,
        label: TAX_ALLOCATION_LABELS[key],
        valueJpy: value.toFixed(0),
        ratio: params.totalValue.gt(0) ? value.div(params.totalValue).toFixed(4) : '0',
      };
    })
    .filter(segment => !new Decimal(segment.valueJpy).isZero());
}

export function displayHoldingTitle(assetClass: string, symbol: string, name: string): {
  title: string;
  subtitle: string | null;
} {
  if (isUsStock(assetClass)) {
    return { title: symbol, subtitle: name };
  }
  return { title: name, subtitle: null };
}

export type { AccountType, AssetClass };
