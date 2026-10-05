'use client';

import Link from 'next/link';
import type { ModuleLoadResult } from '@/lib/module-types';
import type { PortfolioData } from './types';
import Decimal from 'decimal.js';

export function PortfolioCard({ 
  result, 
  onRefresh 
}: { 
  result: ModuleLoadResult<PortfolioData>; 
  onRefresh: () => void;
}) {
  if (result.status === 'error') {
    return (
      <div className="rounded-3xl bg-gray-900 border border-gray-800 p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-100 mb-1">持仓</h3>
            <p className="text-sm text-gray-400">{result.message}</p>
            {result.retryable && (
              <button
                onClick={onRefresh}
                className="mt-3 text-sm text-cyan-400 hover:text-cyan-300"
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
      <div className="rounded-3xl bg-gray-900 border border-gray-800 p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-100">持仓</h3>
          </div>
        </div>
        
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">还没有持仓数据</p>
          <Link
            href="/portfolio"
            className="inline-block px-6 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            去录入
          </Link>
          <p className="text-xs text-gray-500 mt-3">支持手动、SBI CSV、截图</p>
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
    <div className="rounded-3xl bg-gray-900 border border-gray-800 p-6">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-100">持仓</h3>
            <p className="text-sm text-gray-400">快照日期：{data.asOf}</p>
            {data.stale && (
              <p className="text-xs text-yellow-400 mt-1">
                数据已 {Math.floor((Date.now() - new Date(data.asOf).getTime()) / (1000 * 60 * 60 * 24))} 天未更新
              </p>
            )}
            {data.missingFxCount > 0 && (
              <p className="text-xs text-amber-500 mt-1">
                缺少 {data.missingFxCount} 个汇率
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/portfolio" className="text-cyan-400 hover:text-cyan-300">
            ＋ 录入
          </Link>
          <Link href="/portfolio" className="text-cyan-400 hover:text-cyan-300">
            明细 →
          </Link>
        </div>
      </div>

      {/* 前 3 大持仓 */}
      <div className="space-y-3 mb-6">
        {topThree.map((holding, i) => {
          const pnl = new Decimal(holding.unrealizedPnlJpy);
          const pnlRatio = new Decimal(holding.pnlRatio).times(100);
          const isPositive = pnl.gte(0);

          return (
            <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-100">{holding.name}</div>
                <div className="text-xs text-gray-500">{holding.accountType}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-gray-100">
                  ¥{formatNumber(holding.valueJpy)}
                </div>
                <div className={`text-xs font-mono ${isPositive ? 'text-lime-400' : 'text-red-400'}`}>
                  {isPositive ? '+' : ''}{pnlRatio.toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 账户分布 */}
      <div className="mb-2">
        <p className="text-xs text-gray-400 mb-2">按账户</p>
        <div className="h-3 flex rounded-full overflow-hidden bg-gray-800">
          {data.allocationByAccount.slice(0, 4).map((alloc, i) => {
            const colors = [
              'bg-cyan-400',
              'bg-blue-400', 
              'bg-purple-400',
              'bg-pink-400'
            ];
            const ratio = new Decimal(alloc.ratio).times(100).toNumber();
            
            return (
              <div
                key={i}
                className={colors[i % colors.length]}
                style={{ width: `${ratio}%` }}
                title={`${alloc.label}: ${ratio.toFixed(1)}%`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          {data.allocationByAccount.slice(0, 4).map((alloc, i) => {
            const colors = [
              'text-cyan-400',
              'text-blue-400',
              'text-purple-400', 
              'text-pink-400'
            ];
            const ratio = new Decimal(alloc.ratio).times(100);
            
            return (
              <div key={i} className="flex items-center gap-1">
                <span className={colors[i % colors.length]}>●</span>
                <span className="text-gray-400">{alloc.label}</span>
                <span className="text-gray-500">{ratio.toFixed(0)}%</span>
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
