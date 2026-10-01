'use client';

import { useState } from 'react';
import Link from 'next/link';
import { initializeModules } from '@/modules';
import { getAllModules } from '@/lib/module-registry';
import { getUserSettings, toggleModule, updateUserSettings } from '@/lib/user-settings';
import { useRouter } from 'next/navigation';

// 初始化模块注册
initializeModules();

export default function SettingsPage() {
  const router = useRouter();
  const allModules = getAllModules();
  const [settings, setSettings] = useState(getUserSettings());

  const handleToggleModule = (moduleId: string) => {
    const currentEnabled = (settings.modules as any)[moduleId]?.enabled !== false;
    toggleModule(moduleId, !currentEnabled);
    setSettings(getUserSettings());
    router.refresh();
  };

  const handleUpdateConfig = (key: string, value: any) => {
    updateUserSettings({
      config: {
        ...settings.config,
        [key]: value,
      },
    });
    setSettings(getUserSettings());
  };

  const ageBands = [
    { value: '0-6m', label: '0-6个月' },
    { value: '6-12m', label: '6-12个月' },
    { value: '1-2y', label: '1-2岁' },
    { value: '2-3y', label: '2-3岁' },
    { value: '3y+', label: '3岁以上' },
  ];

  const themes = [
    { value: 'sleep', label: '睡眠' },
    { value: 'feeding', label: '喂养' },
    { value: 'play', label: '玩耍' },
    { value: 'health', label: '健康' },
    { value: 'emotion', label: '情绪' },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 顶栏 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">设置</h1>
          <Link
            href="/"
            className="text-sm text-blue-600 hover:text-blue-800 px-4 py-2 rounded hover:bg-blue-50"
          >
            返回首页
          </Link>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* 模块开关 */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">模块管理</h2>
          <div className="space-y-4">
            {allModules.map((module) => {
              const enabled = settings.modules[module.manifest.id]?.enabled !== false;
              return (
                <div
                  key={module.manifest.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded"
                >
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{module.manifest.name}</h3>
                    <p className="text-sm text-gray-600">{module.manifest.description}</p>
                    {module.manifest.requires.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        需要: {module.manifest.requires.join(', ')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggleModule(module.manifest.id)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      enabled ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* 育儿配置 */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">育儿配置</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                宝宝年龄段
              </label>
              <select
                value={settings.config['parenting.ageBand'] || ''}
                onChange={(e) => handleUpdateConfig('parenting.ageBand', e.target.value || undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">未选择</option>
                {ageBands.map((band) => (
                  <option key={band.value} value={band.value}>
                    {band.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                关注主题（可多选）
              </label>
              <div className="grid grid-cols-2 gap-2">
                {themes.map((theme) => {
                  const selectedThemes = settings.config['parenting.themes'] || [];
                  const isSelected = selectedThemes.includes(theme.value as any);
                  return (
                    <button
                      key={theme.value}
                      onClick={() => {
                        const current = settings.config['parenting.themes'] || [];
                        const newThemes = isSelected
                          ? current.filter((t) => t !== theme.value)
                          : [...current, theme.value as any];
                        handleUpdateConfig('parenting.themes', newThemes.length > 0 ? newThemes : undefined);
                      }}
                      className={`px-4 py-2 rounded border ${
                        isSelected
                          ? 'bg-blue-100 border-blue-500 text-blue-800'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {theme.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* 连接器状态（M0: 静态显示） */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">连接状态</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
              <div>
                <span className="font-medium">Gmail</span>
                <span className="text-sm text-gray-600 ml-2">user@gmail.com</span>
              </div>
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                已连接
              </span>
            </div>
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
              <div>
                <span className="font-medium">GitHub</span>
                <span className="text-sm text-gray-600 ml-2">@Avocado-0324</span>
              </div>
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                已连接
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            M0 阶段：连接器状态为模拟数据，M1+ 将接入真实 OAuth
          </p>
        </section>
      </main>
    </div>
  );
}
