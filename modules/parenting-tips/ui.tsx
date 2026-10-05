'use client';

import type { ModuleLoadResult } from '@/lib/module-types';
import type { ParentingTipsData } from './types';

type Props = {
  result: ModuleLoadResult<ParentingTipsData>;
  onRefresh: () => void;
};

const themeColors = {
  sleep: 'bg-purple-500/15 text-purple-300',
  feeding: 'bg-green-500/15 text-green-300',
  play: 'bg-yellow-500/15 text-yellow-300',
  health: 'bg-red-500/15 text-red-300',
  emotion: 'bg-pink-500/15 text-pink-300',
  general: 'bg-blue-500/15 text-blue-300',
};

const themeLabels = {
  sleep: '睡眠',
  feeding: '喂养',
  play: '玩耍',
  health: '健康',
  emotion: '情绪',
  general: '通用',
};

export function Card({ result, onRefresh }: Props) {
  if (result.status === 'error') {
    return (
      <div className="bg-card-bg border border-card-border rounded-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-[30px] h-[30px] rounded-lg bg-pink-500/10 text-pink-400
                            flex items-center justify-center text-[15px]">
              ✿
            </div>
            <h2 className="text-base font-semibold">育儿 Tips</h2>
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
            <div className="w-[30px] h-[30px] rounded-lg bg-pink-500/10 text-pink-400
                            flex items-center justify-center text-[15px]">
              ✿
            </div>
            <h2 className="text-base font-semibold">育儿 Tips</h2>
          </div>
        </div>
        <div className="text-muted text-center py-8">
          <p>暂无建议</p>
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
          <div className="w-[30px] h-[30px] rounded-lg bg-pink-500/10 text-pink-400
                          flex items-center justify-center text-[15px]">
            ✿
          </div>
          <h2 className="text-base font-semibold">育儿 Tips</h2>
          <span className="text-[13px] text-muted font-normal">今日</span>
        </div>
        <button
          onClick={onRefresh}
          className="text-[13px] font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          换一批
        </button>
      </div>

      <div className="space-y-2.5">
        {data.items.map((item) => (
          <div key={item.id} className="bg-tile rounded-2xl p-4">
            <div className="flex items-start justify-between mb-1.5">
              <h3 className="font-semibold text-[14px] flex-1">{item.title}</h3>
              <span className={`text-[11.5px] px-2.5 py-0.5 rounded-full font-semibold
                                whitespace-nowrap ml-2 ${themeColors[item.theme]}`}>
                {themeLabels[item.theme]}
              </span>
            </div>
            <p className="text-[13px] text-muted leading-relaxed">{item.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
