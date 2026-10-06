import { describe, it, expect } from '@jest/globals';
import Decimal from 'decimal.js';
import {
  formatAsOfMd,
  formatAsOfRangeLabel,
  formatAccountBreakdown,
  mergeHoldingsByInstrument,
  buildTaxAllocation,
  displayHoldingTitle,
} from '../modules/portfolio/display';
import { isFxRateString, isCurrencyCode, isUuid } from '../lib/validation';

describe('display helpers', () => {
  it('formatAsOfMd 不走 Date，避免时区差一天', () => {
    expect(formatAsOfMd('2026-10-06')).toBe('10月6日');
    expect(formatAsOfMd('2026-01-01')).toBe('1月1日');
  });

  it('asOf 全相同时不显示区间', () => {
    expect(formatAsOfRangeLabel(['2026-10-06', '2026-10-06'])).toBeNull();
  });

  it('asOf 不同时显示数据日期 A–B', () => {
    expect(formatAsOfRangeLabel(['2026-10-06', '2026-10-01'])).toBe('数据日期 10月1日–10月6日');
  });

  it('按代码+币种合并，不按名称', () => {
    const merged = mergeHoldingsByInstrument([
      {
        symbol: 'VOO',
        name: 'バンガード',
        currency: 'USD',
        assetClass: 'us_stock',
        value: new Decimal(1000),
        unrealizedPnl: new Decimal(10),
        accountType: 'tokutei',
      },
      {
        symbol: 'VOO',
        name: '别名不应拆开',
        currency: 'USD',
        assetClass: 'us_stock',
        value: new Decimal(500),
        unrealizedPnl: new Decimal(5),
        accountType: 'nisa_growth',
      },
      {
        symbol: 'VOO',
        name: 'バンガード',
        currency: 'JPY',
        assetClass: 'us_stock',
        value: new Decimal(200),
        unrealizedPnl: new Decimal(1),
        accountType: 'tokutei',
      },
    ]);

    expect(merged).toHaveLength(2);
    const usd = merged.find(h => h.currency === 'USD');
    expect(usd?.value.toString()).toBe('1500');
    expect(usd?.tokuteiCount).toBe(1);
    expect(usd?.nisaCount).toBe(1);
    expect(formatAccountBreakdown(usd!.tokuteiCount, usd!.nisaCount)).toBe('特定 1 · NISA 1');
  });

  it('美股代码作主名，片假名作副标题', () => {
    expect(displayHoldingTitle('us_stock', 'VOO', 'バンガード')).toEqual({
      title: 'VOO',
      subtitle: 'バンガード',
    });
    expect(displayHoldingTitle('jp_stock', '7203', 'トヨタ自動車')).toEqual({
      title: 'トヨタ自動車',
      subtitle: null,
    });
  });

  it('分布条按 NISA / 特定 / 现金 三段，日美合并', () => {
    const alloc = buildTaxAllocation({
      holdings: [
        { accountType: 'tokutei', value: new Decimal(100) },
        { accountType: 'nisa_growth', value: new Decimal(40) },
        { accountType: 'nisa_tsumitate', value: new Decimal(10) },
      ],
      cashTotal: new Decimal(50),
      totalValue: new Decimal(200),
    });

    expect(alloc.map(a => a.label)).toEqual(['NISA', '特定', '现金']);
    expect(alloc.find(a => a.accountType === 'nisa')?.valueJpy).toBe('50');
    expect(alloc.find(a => a.accountType === 'tokutei')?.valueJpy).toBe('100');
    expect(alloc.find(a => a.accountType === 'cash')?.valueJpy).toBe('50');
  });
});

describe('validation', () => {
  it('汇率正则拒绝 150abc、前导零、多余小数', () => {
    expect(isFxRateString('150.25')).toBe(true);
    expect(isFxRateString('150abc')).toBe(false);
    expect(isFxRateString('00.5')).toBe(false);
    expect(isFxRateString('1.1234567')).toBe(false);
    expect(isFxRateString('150.')).toBe(false);
  });

  it('currency 必须是 3 位大写字母', () => {
    expect(isCurrencyCode('USD')).toBe(true);
    expect(isCurrencyCode('usd')).toBe(false);
    expect(isCurrencyCode('US')).toBe(false);
    expect(isCurrencyCode('US1')).toBe(false);
  });

  it('uuid 校验', () => {
    expect(isUuid('f91c2d10-1234-4000-8000-1234567890ab')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});
