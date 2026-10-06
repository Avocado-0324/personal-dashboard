'use client';

import Link from 'next/link';
import type { ModuleLoadResult } from '@/lib/module-types';
import type { PortfolioData } from './types';
import Decimal from 'decimal.js';
import { displayHoldingTitle } from './display';

const ALLOCATION_SEGMENT_COLORS = [
  { bar: 'bg-accent', text: 'text-accent' },
  { bar: 'bg-up', text: 'text-up' },
  { bar: 'bg-warn', text: 'text-warn' },
] as const;

export function PortfolioCard({ 
  result, 
  onRefresh 
}: { 
  result: ModuleLoadResult<PortfolioData>; 
  onRefresh: () => void;
}) {
  if (result.status === 'error') {
    return (
      <div className="rounded-card bg-card-bg border border-card-border p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-down/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-down" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground mb-1">持仓</h3>
            <p className="text-sm text-muted">{result.message}</p>
            {result.retryable && (
              <button
                onClick={onRefresh}
                className="mt-3 text-sm text-accent hover:opacity-80"
              >
                重试
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (result.status === 'empty') {
    return (
      <div className="rounded-card bg-card-bg border border-card-border p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground">持仓</h3>
          </div>
        </div>
        
        <div className="text-center py-8">
          <p className="text-muted mb-4">还没有持仓数据：日本持仓可用 CSV 导入，美股发截图给 Grok。</p>
          <Link
            href="/portfolio"
            className="inline-block px-6 py-2 bg-accent text-background rounded-lg hover:opacity-90 transition-colors"
          >
            去录入
          </Link>
        </div>
      </div>
    );
  }

  if (result.status !== 'ok') {
    return null;
  }

  const data = result.data;
  const topThree = data.topHoldings.slice(0, 3);

  return (
    <div className="rounded-card bg-card-bg border border-card-border p-6">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">持仓</h3>
            <p className="text-sm text-muted">快照日期：{data.asOf}</p>
            {data.stale && (
              <p className="text-xs text-warn mt-1">
                数据已 {Math.floor((Date.now() - new Date(data.asOf).getTime()) / (1000 * 60 * 60 * 24))} 天未更新
              </p>
            )}
            {data.missingFxCount > 0 && (
              <p className="text-xs text-warn mt-1">
                缺少 {data.missingFxCount} 个汇率
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 text-sm whitespace-nowrap">
          <Link href="/portfolio" className="text-accent hover:opacity-80">
            ＋录入
          </Link>
          <Link href="/portfolio" className="text-accent hover:opacity-80">
            明细
          </Link>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {topThree.map((holding, i) => {
          const pnl = new Decimal(holding.unrealizedPnlJpy);
          const pnlRatio = new Decimal(holding.pnlRatio).times(100);
          const isPositive = pnl.gte(0);
          const { title, subtitle } = displayHoldingTitle(holding.assetClass, holding.symbol, holding.name);

          return (
            <div key={`${holding.symbol}-${holding.currency}-${i}`} className="flex items-center justify-between py-2 border-b border-card-border last:border-0">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">{title}</div>
                {subtitle && (
                  <div className="text-xs text-muted">{subtitle}</div>
                )}
                {holding.accountBreakdown && (
                  <div className="text-xs text-muted">{holding.accountBreakdown}</div>
                )}
              </div>
              <div className="text-right">
                <div className="font-mono text-foreground">
                  ¥{formatNumber(holding.valueJpy)}
                </div>
                <div className={`text-xs font-mono ${isPositive ? 'text-up' : 'text-down'}`}>
                  {isPositive ? '+' : ''}{pnlRatio.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-2">
        <p className="text-xs text-muted mb-2">按税制</p>
        <div className="h-3 flex rounded-full overflow-hidden bg-tile">
          {data.allocationByAccount.map((alloc, i) => {
            const color = ALLOCATION_SEGMENT_COLORS[i % ALLOCATION_SEGMENT_COLORS.length];
            const ratio = new Decimal(alloc.ratio).times(100).toNumber();
            
            return (
              <div
                key={alloc.accountType}
                className={color.bar}
                style={{ width: `${ratio}%` }}
                title={`${alloc.label}: ${ratio.toFixed(1)}%`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          {data.allocationByAccount.map((alloc, i) => {
            const color = ALLOCATION_SEGMENT_COLORS[i % ALLOCATION_SEGMENT_COLORS.length];
            const ratio = new Decimal(alloc.ratio).times(100);
            
            return (
              <div key={alloc.accountType} className="flex items-center gap-1">
                <span className={color.text}>●</span>
                <span className="text-muted">{alloc.label}</span>
                <span className="text-muted">{ratio.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatNumber(value: string): string {
  const num = parseFloat(value);
  return num.toLocaleString('ja-JP', { maximumFractionDigits: 0 });
}
