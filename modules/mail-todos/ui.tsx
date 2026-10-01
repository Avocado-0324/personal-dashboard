'use client';

import type { ModuleLoadResult } from '@/lib/module-types';
import type { MailTodosData } from './types';

type Props = {
  result: ModuleLoadResult<MailTodosData>;
  onRefresh: () => void;
};

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const date = new Date(isoString);
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return `${days}天前`;
}

export function Card({ result, onRefresh }: Props) {
  if (result.status === 'disconnected') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">邮件待办</h2>
        <div className="text-gray-500 text-center py-8">
          <p>未连接 Gmail</p>
          <p className="text-sm mt-2">请在设置中连接您的 Gmail 账户</p>
        </div>
      </div>
    );
  }

  if (result.status === 'unconfigured') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">邮件待办</h2>
        <div className="text-gray-500 text-center py-8">
          <p>需要配置</p>
        </div>
      </div>
    );
  }

  if (result.status === 'error') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">邮件待办</h2>
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
        <h2 className="text-xl font-bold mb-4">邮件待办</h2>
        <div className="text-gray-500 text-center py-8">
          <p>收件箱无未读邮件</p>
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
        <h2 className="text-xl font-bold">邮件待办</h2>
        <button
          onClick={onRefresh}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          刷新
        </button>
      </div>

      <div className="space-y-3">
        {data.items.map((item) => (
          <a
            key={item.id}
            href={item.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 border border-gray-200 rounded hover:bg-gray-50 transition"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {item.from}
                  </span>
                  {item.needsReply && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                      待回复
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 truncate">{item.subject}</p>
              </div>
              <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                {formatRelativeTime(item.receivedAt)}
              </span>
            </div>
          </a>
        ))}
      </div>

      {data.totalCount > data.items.length && (
        <div className="mt-4 text-center">
          <a
            href="https://mail.google.com/mail/u/0/#search/is%3Aunread"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            查看全部 ({data.totalCount})
          </a>
        </div>
      )}
    </div>
  );
}
