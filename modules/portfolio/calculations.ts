import Decimal from 'decimal.js';

// XIRR 计算配置
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-6;
const MIN_DAYS_FOR_XIRR = 30;
const XIRR_MIN = -0.99;
const XIRR_MAX = 10.0;

export type CashFlow = {
  date: Date;
  amount: Decimal; // 负数为流出（入金），正数为流入（出金+终值）
};

/**
 * 计算 XIRR（内部收益率）
 * Newton-Raphson 迭代，不收敛时改用二分法
 */
export function calculateXIRR(flows: CashFlow[]): Decimal | null {
  if (flows.length < 2) return null;
  
  // 检查是否有入金
  const hasDeposit = flows.some(f => f.amount.isNegative());
  if (!hasDeposit) return null;
  
  // 检查时间跨度
  const sortedFlows = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstDate = sortedFlows[0].date;
  const lastDate = sortedFlows[sortedFlows.length - 1].date;
  const daysDiff = Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < MIN_DAYS_FOR_XIRR) return null;
  
  // 尝试 Newton-Raphson
  try {
    const xirr = newtonRaphson(sortedFlows);
    if (xirr !== null && xirr.gte(XIRR_MIN) && xirr.lte(XIRR_MAX)) {
      return xirr;
    }
  } catch {}
  
  // 回退到二分法
  try {
    return bisection(sortedFlows);
  } catch {
    return null;
  }
}

function newtonRaphson(flows: CashFlow[]): Decimal | null {
  let rate = new Decimal(0.1); // 初始猜测 10%
  const baseDate = flows[0].date;
  
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const npv = calculateNPV(flows, rate, baseDate);
    const derivative = calculateDerivative(flows, rate, baseDate);
    
    if (derivative.abs().lt(1e-10)) return null;
    
    const newRate = rate.minus(npv.div(derivative));
    
    if (newRate.minus(rate).abs().lt(TOLERANCE)) {
      return newRate;
    }
    
    rate = newRate;
    
    // 防止发散
    if (rate.lt(XIRR_MIN) || rate.gt(XIRR_MAX)) {
      return null;
    }
  }
  
  return null;
}

function bisection(flows: CashFlow[]): Decimal | null {
  let low = new Decimal(XIRR_MIN);
  let high = new Decimal(XIRR_MAX);
  const baseDate = flows[0].date;
  
  const npvLow = calculateNPV(flows, low, baseDate);
  const npvHigh = calculateNPV(flows, high, baseDate);
  
  // 检查区间是否包含解
  if (npvLow.times(npvHigh).gt(0)) return null;
  
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const mid = low.plus(high).div(2);
    const npvMid = calculateNPV(flows, mid, baseDate);
    
    if (npvMid.abs().lt(TOLERANCE)) {
      return mid;
    }
    
    if (npvLow.times(npvMid).lt(0)) {
      high = mid;
    } else {
      low = mid;
      // npvLow = npvMid; // 不需要更新，因为我们总是用 calculateNPV
    }
    
    if (high.minus(low).abs().lt(TOLERANCE)) {
      return low.plus(high).div(2);
    }
  }
  
  return null;
}

function calculateNPV(flows: CashFlow[], rate: Decimal, baseDate: Date): Decimal {
  return flows.reduce((sum, flow) => {
    const years = daysBetween(baseDate, flow.date) / 365.0;
    const factor = rate.plus(1).pow(years);
    return sum.plus(flow.amount.div(factor));
  }, new Decimal(0));
}

function calculateDerivative(flows: CashFlow[], rate: Decimal, baseDate: Date): Decimal {
  return flows.reduce((sum, flow) => {
    const years = daysBetween(baseDate, flow.date) / 365.0;
    const factor = rate.plus(1).pow(years);
    const term = flow.amount.times(years).div(factor.times(rate.plus(1)));
    return sum.minus(term);
  }, new Decimal(0));
}

function daysBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 格式化金额为字符串（千分位）
 */
export function formatAmount(amount: Decimal, decimals: number = 0): string {
  const rounded = amount.toFixed(decimals);
  const [integer, decimal] = rounded.split('.');
  const withCommas = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal ? `${withCommas}.${decimal}` : withCommas;
}

/**
 * 格式化百分比
 */
export function formatPercent(value: Decimal, decimals: number = 1): string {
  return value.times(100).toFixed(decimals) + '%';
}

/**
 * 检查快照是否过期（超过 7 天）
 */
export function isStale(asOfDate: Date): boolean {
  const now = new Date();
  const daysDiff = Math.floor((now.getTime() - asOfDate.getTime()) / (1000 * 60 * 60 * 24));
  return daysDiff > 7;
}
