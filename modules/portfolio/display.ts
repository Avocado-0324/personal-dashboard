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
  quantity: string | Decimal;
};

export type MergedHolding = {
  symbol: string;
  name: string;
  currency: string;
  assetClass: string;
  value: Decimal;
  unrealizedPnl: Decimal;
  tokuteiQty: Decimal;
  nisaQty: Decimal;
};

export function formatQuantity(qty: string | Decimal): string {
  const num = qty instanceof Decimal ? qty : new Decimal(qty);
  const isInteger = num.modulo(1).isZero();

  if (isInteger) {
    return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  let formatted = num.toFixed(4);
  formatted = formatted.replace(/0+$/, '').replace(/\.$/, '');
  const parts = formatted.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

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

export function formatAccountBreakdown(tokuteiQty: Decimal | string | number, nisaQty: Decimal | string | number): string {
  const tokutei = tokuteiQty instanceof Decimal ? tokuteiQty : new Decimal(tokuteiQty);
  const nisa = nisaQty instanceof Decimal ? nisaQty : new Decimal(nisaQty);
  const parts: string[] = [];
  if (tokutei.gt(0)) parts.push(`特定 ${formatQuantity(tokutei)}`);
  if (nisa.gt(0)) parts.push(`NISA ${formatQuantity(nisa)}`);
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
    const qty = holding.quantity instanceof Decimal ? holding.quantity : new Decimal(holding.quantity);
    const tokuteiInc = holding.accountType === 'tokutei' ? qty : new Decimal(0);
    const nisaInc = isNisaType(holding.accountType) ? qty : new Decimal(0);

    if (!existing) {
      merged.set(key, {
        symbol: holding.symbol,
        name: holding.name,
        currency: holding.currency,
        assetClass: holding.assetClass,
        value: holding.value,
        unrealizedPnl: holding.unrealizedPnl,
        tokuteiQty: tokuteiInc,
        nisaQty: nisaInc,
      });
      continue;
    }

    existing.value = existing.value.plus(holding.value);
    existing.unrealizedPnl = existing.unrealizedPnl.plus(holding.unrealizedPnl);
    existing.tokuteiQty = existing.tokuteiQty.plus(tokuteiInc);
    existing.nisaQty = existing.nisaQty.plus(nisaInc);
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

export const TAX_SEGMENT_COLORS: Record<TaxAllocationKey, { bar: string; text: string }> = {
  nisa: { bar: 'bg-accent', text: 'text-accent' },
  tokutei: { bar: 'bg-accent/45', text: 'text-accent/45' },
  cash: { bar: 'bg-muted/50', text: 'text-muted/50' },
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
