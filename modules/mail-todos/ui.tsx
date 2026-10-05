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

function getInitial(from: string): string {
  return from.charAt(0).toUpperCase();
}

function getAvatarColor(from: string): string {
  const colors = [
    'bg-red-900/40 text-red-300',
    'bg-purple-900/40 text-purple-300',
    'bg-slate-700 text-slate-200'
  ];
  const index = from.charCodeAt(0) % colors.length;
  return colors[index];
}

export function Card({ result, onRefresh }: Props) {
  if (result.status === 'disconnected') {
    return (
      <div className="bg-card-bg border border-card-border rounded-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-[30px] h-[30px] rounded-lg bg-accent/10 text-accent
                            flex items-center justify-center text-[15px]">
              ✉
            </div>
            <h2 className="text-base font-semibold">邮件待办</h2>
          </div>
        </div>
        <div className="text-muted text-center py-8">
          <p className="mb-2">未连接 Gmail</p>
          <p className="text-sm mb-4">请在设置中连接您的 Gmail 账户</p>
          <a
            href="/settings"
            className="inline-block px-6 py-2 bg-accent text-background rounded-lg
                       hover:opacity-90 transition font-medium"
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
            <div className="w-[30px] h-[30px] rounded-lg bg-accent/10 text-accent
                            flex items-center justify-center text-[15px]">
              ✉
            </div>
            <h2 className="text-base font-semibold">邮件待办</h2>
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
            <div className="w-[30px] h-[30px] rounded-lg bg-accent/10 text-accent
                            flex items-center justify-center text-[15px]">
              ✉
            </div>
            <h2 className="text-base font-semibold">邮件待办</h2>
          </div>
        </div>
        <div className="text-center py-8">
          <p className="text-down mb-4">加载失败：{result.message}</p>
          <button
            onClick={onRefresh}
            className="px-4 py-2 bg-accent text-background rounded-lg
                       hover:opacity-90 transition font-medium"
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
            <div className="w-[30px] h-[30px] rounded-lg bg-accent/10 text-accent
                            flex items-center justify-center text-[15px]">
              ✉
            </div>
            <h2 className="text-base font-semibold">邮件待办</h2>
          </div>
        </div>
        <div className="text-muted text-center py-8">
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
    <div className="bg-card-bg border border-card-border rounded-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-[30px] h-[30px] rounded-lg bg-accent/10 text-accent
                          flex items-center justify-center text-[15px]">
            ✉
          </div>
          <h2 className="text-base font-semibold">邮件待办</h2>
          <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold
                           bg-accent text-background font-feature-tnum">
            {data.totalCount}
          </span>
        </div>
        <a
          href="https://mail.google.com/mail/u/0/#inbox"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] font-medium text-accent hover:underline"
        >
          打开 Gmail ↗
        </a>
      </div>

      <div className="space-y-0">
        {data.items.map((item, idx) => (
          <a
            key={item.id}
            href={item.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex gap-3 py-3 px-1 hover:bg-tile/50 transition -mx-1 rounded
                        ${idx < data.items.length - 1 ? 'border-b border-card-border' : ''}`}
          >
            <div className={`w-[34px] h-[34px] rounded-full flex-none
                              flex items-center justify-center font-bold text-[13px]
                              ${getAvatarColor(item.from)}`}>
              {getInitial(item.from)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold truncate">
                    {item.from}
                  </span>
                  {item.needsReply && (
                    <span className="text-[11.5px] bg-yellow-500/15 text-yellow-300
                                     px-2.5 py-0.5 rounded-full font-semibold whitespace-nowrap">
                      需回复
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted ml-2 whitespace-nowrap font-feature-tnum">
                  {formatRelativeTime(item.receivedAt)}
                </span>
              </div>
              <p className="text-[13px] text-muted truncate">{item.subject}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
