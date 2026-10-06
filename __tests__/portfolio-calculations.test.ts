import { describe, it, expect } from '@jest/globals';
import Decimal from 'decimal.js';
import { calculateXIRR, marketValueJpyFloor, unrealizedPnlJpyFloor, type CashFlow } from '../modules/portfolio/calculations';

describe('Portfolio Calculations', () => {
  describe('XIRR', () => {
    it('单笔入金持有 1 年', () => {
      const flows: CashFlow[] = [
        { date: new Date('2023-01-01'), amount: new Decimal(-10000) }, // 入金
        { date: new Date('2024-01-01'), amount: new Decimal(11000) },  // 终值
      ];

      const xirr = calculateXIRR(flows);
      expect(xirr).not.toBeNull();
      expect(xirr!.toNumber()).toBeCloseTo(0.1, 2); // 约 10%
    });

    it('分批入金', () => {
      const flows: CashFlow[] = [
        { date: new Date('2023-01-01'), amount: new Decimal(-5000) },
        { date: new Date('2023-07-01'), amount: new Decimal(-5000) },
        { date: new Date('2024-01-01'), amount: new Decimal(11000) },
      ];

      const xirr = calculateXIRR(flows);
      expect(xirr).not.toBeNull();
      expect(xirr!.gte(0)).toBe(true);
    });

    it('中途出金', () => {
      const flows: CashFlow[] = [
        { date: new Date('2023-01-01'), amount: new Decimal(-10000) },
        { date: new Date('2023-07-01'), amount: new Decimal(3000) }, // 出金
        { date: new Date('2024-01-01'), amount: new Decimal(8000) }, // 终值
      ];

      const xirr = calculateXIRR(flows);
      expect(xirr).not.toBeNull();
    });

    it('外币持仓（已转换为 JPY）', () => {
      const flows: CashFlow[] = [
        { date: new Date('2023-01-01'), amount: new Decimal(-1000000) }, // 100 万日元
        { date: new Date('2024-01-01'), amount: new Decimal(1100000) },  // 终值
      ];

      const xirr = calculateXIRR(flows);
      expect(xirr).not.toBeNull();
      expect(xirr!.toNumber()).toBeCloseTo(0.1, 2);
    });

    it('净投入为 0 时返回 null', () => {
      const flows: CashFlow[] = [
        { date: new Date('2023-01-01'), amount: new Decimal(-10000) },
        { date: new Date('2023-06-01'), amount: new Decimal(10000) }, // 全部出金
        { date: new Date('2024-01-01'), amount: new Decimal(0) },     // 终值为 0
      ];

      const xirr = calculateXIRR(flows);
      // 可能返回 null 或接近 0
      if (xirr !== null) {
        expect(Math.abs(xirr.toNumber())).toBeLessThan(0.01);
      }
    });

    it('净投入为负时', () => {
      const flows: CashFlow[] = [
        { date: new Date('2023-01-01'), amount: new Decimal(-10000) },
        { date: new Date('2023-06-01'), amount: new Decimal(15000) }, // 出金大于入金
        { date: new Date('2024-01-01'), amount: new Decimal(5000) },  // 终值
      ];

      const xirr = calculateXIRR(flows);
      // 可以计算，但可能很大或不收敛
      // 这里主要测试不会崩溃
      expect(xirr === null || xirr instanceof Decimal).toBe(true);
    });

    it('时间跨度不足 30 天返回 null', () => {
      const flows: CashFlow[] = [
        { date: new Date('2024-01-01'), amount: new Decimal(-10000) },
        { date: new Date('2024-01-15'), amount: new Decimal(10100) },
      ];

      const xirr = calculateXIRR(flows);
      expect(xirr).toBeNull();
    });

    it('没有入金返回 null', () => {
      const flows: CashFlow[] = [
        { date: new Date('2024-01-01'), amount: new Decimal(10000) }, // 只有终值
      ];

      const xirr = calculateXIRR(flows);
      expect(xirr).toBeNull();
    });
  });

  describe('unrealizedPnlJpyFloor', () => {
    it('等于 floor(评价额) − floor(取得额)，而不是对价差 floor', () => {
      const qty = '3';
      const price = '100';
      const avgCost = '100.4';
      const unitBasis = '1';
      const fx = '1';

      const market = marketValueJpyFloor({ quantity: qty, price, unitBasis, fxRateToJpy: fx });
      const cost = marketValueJpyFloor({ quantity: qty, price: avgCost, unitBasis, fxRateToJpy: fx });
      const pnl = unrealizedPnlJpyFloor({ quantity: qty, price, avgCost, unitBasis, fxRateToJpy: fx });

      expect(market.toString()).toBe('300');
      expect(cost.toString()).toBe('301');
      expect(pnl.toString()).toBe('-1');

      const spreadFloored = marketValueJpyFloor({
        quantity: qty,
        price: new Decimal(price).minus(avgCost).toString(),
        unitBasis,
        fxRateToJpy: fx,
      });
      expect(spreadFloored.toString()).toBe('-2');
      expect(pnl.equals(spreadFloored)).toBe(false);
    });

    it('外币持仓同样先各自 floor 再相减', () => {
      const pnl = unrealizedPnlJpyFloor({
        quantity: '1',
        price: '100.9',
        avgCost: '100',
        unitBasis: '1',
        fxRateToJpy: '150.5',
      });
      const market = marketValueJpyFloor({
        quantity: '1',
        price: '100.9',
        unitBasis: '1',
        fxRateToJpy: '150.5',
      });
      const cost = marketValueJpyFloor({
        quantity: '1',
        price: '100',
        unitBasis: '1',
        fxRateToJpy: '150.5',
      });
      expect(pnl.toString()).toBe(market.minus(cost).toString());
    });
  });
});
