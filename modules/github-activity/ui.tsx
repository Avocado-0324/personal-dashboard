'use client';

import type { ModuleLoadResult } from '@/lib/module-types';
import type { GithubActivityData } from './types';

type Props = {
  result: ModuleLoadResult<GithubActivityData>;
  onRefresh: () => void;
};

const typeLabels = {
  commit: '提交',
  pr: 'PR',
  review: '代码审查',
  issue: 'Issue',
  other: '其他',
};

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const date = new Date(isoString);
  const diff = now - date.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (hours < 24) return `${hours}小时前`;
  if (days === 1) return '昨天';
  return `${days}天前`;
}

function getHeatColor(count: number): string {
  if (count === 0) return 'bg-tile';
  if (count <= 2) return 'bg-lime-950/60';
  if (count <= 5) return 'bg-lime-800/50';
  if (count <= 8) return 'bg-lime-600/60';
  return 'bg-up';
}

export function Card({ result, onRefresh }: Props) {
  if (result.status === 'disconnected') {
    return (
      <div className="bg-card-bg border border-card-border rounded-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-[30px] h-[30px] rounded-lg bg-up/10 text-up
                            flex items-center justify-center text-[15px]">
              ⌥
            </div>
            <h2 className="text-base font-semibold">GitHub 活跃度</h2>
          </div>
        </div>
        <div className="text-muted text-center py-8">
          <p className="mb-2">未连接 GitHub</p>
          <p className="text-sm mb-4">请在设置中连接您的 GitHub 账户</p>
          <a
            href="/settings"
            className="inline-block px-6 py-2 bg-accent text-background rounded-lg
                       hover:opacity-90 transition font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            去连接
          </a>
        </div>
      </div>
    );
  }

  if (result.status === 'unconfigured') {
    return (
      <div className="bg-card-bg border border-card-border rounded-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-[30px] h-[30px] rounded-lg bg-up/10 text-up
                            flex items-center justify-center text-[15px]">
              ⌥
            </div>
            <h2 className="text-base font-semibold">GitHub 活跃度</h2>
          </div>
        </div>
        <div className="text-muted text-center py-8">
          <p>需要配置</p>
        </div>
      </div>
    );
  }

  if (result.status === 'error') {
    return (
      <div className="bg-card-bg border border-card-border rounded-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-[30px] h-[30px] rounded-lg bg-up/10 text-up
                            flex items-center justify-center text-[15px]">
              ⌥
            </div>
            <h2 className="text-base font-semibold">GitHub 活跃度</h2>
          </div>
        </div>
        <div className="text-center py-8">
          <p className="text-down mb-4">加载失败：{result.message}</p>
          <button
            onClick={onRefresh}
            className="px-4 py-2 bg-accent text-background rounded-lg
                       hover:opacity-90 transition font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (result.status === 'empty') {
    return (
      <div className="bg-card-bg border border-card-border rounded-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-[30px] h-[30px] rounded-lg bg-up/10 text-up
                            flex items-center justify-center text-[15px]">
              ⌥
            </div>
            <h2 className="text-base font-semibold">GitHub 活跃度</h2>
          </div>
        </div>
        <div className="text-muted text-center py-8">
          <p>最近7天无活动</p>
          {result.hint && <p className="text-sm mt-2">{result.hint}</p>}
        </div>
      </div>
    );
  }

  if (result.status !== 'ok') {
    return null;
  }

  const { data } = result;

  const heatMap = Array(14).fill(0);
  data.items.forEach(item => {
    const daysSince = Math.floor((Date.now() - new Date(item.at).getTime()) / 86400000);
    if (daysSince < 14) {
      heatMap[13 - daysSince]++;
    }
  });

  return (
    <div className="bg-card-bg border border-card-border rounded-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-[30px] h-[30px] rounded-lg bg-up/10 text-up
                          flex items-center justify-center text-[15px]">
            ⌥
          </div>
          <h2 className="text-base font-semibold">GitHub 活跃度</h2>
          <span className="text-[13px] text-muted font-normal">最近 7 天</span>
        </div>
        <button
          onClick={onRefresh}
          className="text-[13px] font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          刷新
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-3.5">
        <div className="bg-tile rounded-[14px] px-3.5 py-3">
          <div className="text-[22px] font-semibold font-feature-tnum">{data.summary.commits}</div>
          <div className="text-xs text-muted mt-0.5">提交</div>
        </div>
        <div className="bg-tile rounded-[14px] px-3.5 py-3">
          <div className="text-[22px] font-semibold font-feature-tnum">{data.summary.pullRequests}</div>
          <div className="text-xs text-muted mt-0.5">PR</div>
        </div>
        <div className="bg-tile rounded-[14px] px-3.5 py-3">
          <div className="text-[22px] font-semibold font-feature-tnum">{data.summary.reviews}</div>
          <div className="text-xs text-muted mt-0.5">审查</div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 mb-3">
        {heatMap.map((count, idx) => (
          <div
            key={idx}
            className={`h-[22px] rounded-md ${getHeatColor(count)}`}
            title={`${count} 次活动`}
          />
        ))}
      </div>

      <div className="space-y-0">
        {data.items.slice(0, 2).map((item, idx) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex justify-between py-2 px-0 hover:text-accent transition
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded
                        ${idx === 0 ? 'border-b border-card-border' : ''}`}
          >
            <span className="text-[13px] truncate flex-1">
              {item.type === 'commit' && `推送了提交 · ${item.repo}`}
              {item.type === 'pr' && `合并 PR · ${item.title}`}
              {item.type === 'review' && `审查了 PR · ${item.title}`}
              {item.type === 'issue' && `${item.title}`}
              {item.type === 'other' && item.title}
            </span>
            <span className="text-[13px] text-muted ml-4 whitespace-nowrap">
              {formatRelativeTime(item.at)}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
