'use client';

import type { ModuleLoadResult } from '@/lib/module-types';
import type { ParentingTipsData } from './server';

type Props = {
  result: ModuleLoadResult<ParentingTipsData>;
  onRefresh: () => void;
};

const themeColors = {
  sleep: 'bg-purple-100 text-purple-800',
  feeding: 'bg-green-100 text-green-800',
  play: 'bg-yellow-100 text-yellow-800',
  health: 'bg-red-100 text-red-800',
  emotion: 'bg-pink-100 text-pink-800',
  general: 'bg-blue-100 text-blue-800',
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
  if (result.status === 'unconfigured') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">育儿 Tips</h2>
        <div className="text-gray-500 text-center py-8">
          <p>未配置</p>
          <p className="text-sm mt-2">请在设置中配置宝宝年龄和关注主题</p>
        </div>
      </div>
    );
  }

  if (result.status === 'error') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">育儿 Tips</h2>
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
        <h2 className="text-xl font-bold mb-4">育儿 Tips</h2>
        <div className="text-gray-500 text-center py-8">
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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">育儿 Tips</h2>
          <span className="text-sm text-gray-500">今日</span>
          {data.personalized && (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
              个性化
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          换一批
        </button>
      </div>

      <div className="space-y-4">
        {data.items.map((item) => (
          <div key={item.id} className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-medium text-gray-900">{item.title}</h3>
              <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${themeColors[item.theme]}`}>
                {themeLabels[item.theme]}
              </span>
            </div>
            <p className="text-sm text-gray-600">{item.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
