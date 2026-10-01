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

const typeColors = {
  commit: 'bg-green-100 text-green-800',
  pr: 'bg-blue-100 text-blue-800',
  review: 'bg-purple-100 text-purple-800',
  issue: 'bg-yellow-100 text-yellow-800',
  other: 'bg-gray-100 text-gray-800',
};

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const date = new Date(isoString);
  const diff = now - date.getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (hours < 24) return `${hours}小时前`;
  return `${days}天前`;
}

export function Card({ result, onRefresh }: Props) {
  if (result.status === 'disconnected') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">GitHub 活跃度</h2>
        <div className="text-gray-500 text-center py-8">
          <p>未连接 GitHub</p>
          <p className="text-sm mt-2">请在设置中连接您的 GitHub 账户</p>
        </div>
      </div>
    );
  }

  if (result.status === 'unconfigured') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">GitHub 活跃度</h2>
        <div className="text-gray-500 text-center py-8">
          <p>需要配置</p>
        </div>
      </div>
    );
  }

  if (result.status === 'error') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">GitHub 活跃度</h2>
        <div className="text-red-500 text-center py-8">
          <p>加载失败：{result.message}</p>
          <button
            onClick={onRefresh}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (result.status === 'empty') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">GitHub 活跃度</h2>
        <div className="text-gray-500 text-center py-8">
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

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">GitHub 活跃度</h2>
        <button
          onClick={onRefresh}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          刷新
        </button>
      </div>

      <div className="mb-4 p-4 bg-gray-50 rounded-lg">
        <div className="text-sm text-gray-600 mb-2">
          最近 {data.windowDays} 天 · @{data.login}
        </div>
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-green-600">{data.summary.commits}</span>
            <span className="text-sm text-gray-600">次提交</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-blue-600">{data.summary.pullRequests}</span>
            <span className="text-sm text-gray-600">个 PR</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-purple-600">{data.summary.reviews}</span>
            <span className="text-sm text-gray-600">次审查</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {data.items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 border border-gray-200 rounded hover:bg-gray-50 transition"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${typeColors[item.type]}`}>
                    {typeLabels[item.type]}
                  </span>
                  <span className="text-sm text-gray-500 truncate">{item.repo}</span>
                </div>
                <p className="text-sm text-gray-900">{item.title}</p>
              </div>
              <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                {formatRelativeTime(item.at)}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
