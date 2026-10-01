'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getUserSettings, toggleModule, updateUserSettings } from '@/lib/user-settings';
import { useRouter } from 'next/navigation';
import { signIn, signOut } from 'next-auth/react';

const allModulesConfig = [
  {
    manifest: {
      id: 'mail-todos' as const,
      name: '邮件待办',
      description: '显示收件箱未读邮件',
      requires: ['gmail'],
    }
  },
  {
    manifest: {
      id: 'parenting-tips' as const,
      name: '育儿 Tips',
      description: '根据宝宝年龄推荐育儿建议',
      requires: [],
    }
  },
  {
    manifest: {
      id: 'github-activity' as const,
      name: 'GitHub 活跃度',
      description: '显示最近 7 天的代码活动',
      requires: ['github'],
    }
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(getUserSettings());
  const [demoMode, setDemoMode] = useState<'normal' | 'disconnected' | 'empty'>('normal');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState('');
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubLogin, setGithubLogin] = useState('');

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const demoModeCookie = cookies.find(c => c.trim().startsWith('demo_mode='));
    if (demoModeCookie) {
      const value = demoModeCookie.split('=')[1] as 'normal' | 'disconnected' | 'empty';
      setDemoMode(value || 'normal');
    }

    fetch('/api/gmail/status')
      .then(res => res.json())
      .then(data => {
        setGmailConnected(data.connected);
        setGmailEmail(data.email || '');
      })
      .catch(() => {
        setGmailConnected(false);
      });

    fetch('/api/github/status')
      .then(res => res.json())
      .then(data => {
        setGithubConnected(data.connected);
        setGithubLogin(data.login || '');
      })
      .catch(() => {
        setGithubConnected(false);
      });
  }, []);

  const handleToggleModule = (moduleId: string) => {
    const currentEnabled = (settings.modules as any)[moduleId]?.enabled !== false;
    toggleModule(moduleId, !currentEnabled);
    setSettings(getUserSettings());
    // 刷新页面以重新加载服务端组件
    setTimeout(() => router.refresh(), 100);
  };

  const handleUpdateConfig = (key: string, value: any) => {
    updateUserSettings({
      config: {
        ...settings.config,
        [key]: value,
      },
    });
    setSettings(getUserSettings());
    setTimeout(() => router.refresh(), 100);
  };

  const handleDemoModeChange = (mode: 'normal' | 'disconnected' | 'empty') => {
    setDemoMode(mode);
    // 设置 cookie
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    document.cookie = `demo_mode=${mode}; path=/; expires=${expires.toUTCString()}`;
    // 刷新页面
    setTimeout(() => router.refresh(), 100);
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
            {allModulesConfig.map((module) => {
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

        {/* 演示模式 */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">演示模式（M0 测试）</h2>
          <p className="text-sm text-gray-600 mb-4">
            用于测试模块的不同状态（断连、空数据等）
          </p>
          <div className="space-y-2">
            <button
              onClick={() => handleDemoModeChange('normal')}
              className={`w-full px-4 py-3 rounded border text-left ${
                demoMode === 'normal'
                  ? 'bg-blue-100 border-blue-500 text-blue-900'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="font-medium">正常模式</div>
              <div className="text-sm text-gray-600">显示 mock 数据</div>
            </button>
            <button
              onClick={() => handleDemoModeChange('disconnected')}
              className={`w-full px-4 py-3 rounded border text-left ${
                demoMode === 'disconnected'
                  ? 'bg-blue-100 border-blue-500 text-blue-900'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="font-medium">断连模式</div>
              <div className="text-sm text-gray-600">模拟 Gmail/GitHub 未连接</div>
            </button>
            <button
              onClick={() => handleDemoModeChange('empty')}
              className={`w-full px-4 py-3 rounded border text-left ${
                demoMode === 'empty'
                  ? 'bg-blue-100 border-blue-500 text-blue-900'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="font-medium">空数据模式</div>
              <div className="text-sm text-gray-600">模拟无数据状态</div>
            </button>
          </div>
        </section>

        {/* 育儿配置 */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">育儿配置</h2>
          <p className="text-sm text-gray-600 mb-4">
            根据宝宝年龄段和关注主题，首页将推荐更匹配的育儿建议。跳过配置也可使用，将显示通用建议。
          </p>
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

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">连接状态</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
              <div className="flex-1">
                <div className="font-medium">Gmail</div>
                {gmailConnected && gmailEmail && (
                  <div className="text-sm text-gray-600">{gmailEmail}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded ${
                  gmailConnected 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {gmailConnected ? '已连接' : '未连接'}
                </span>
                {gmailConnected ? (
                  <button
                    onClick={async () => {
                      await fetch('/api/gmail/disconnect', { method: 'POST' });
                      setGmailConnected(false);
                      setGmailEmail('');
                      router.refresh();
                    }}
                    className="text-xs px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
                  >
                    断开
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await fetch('/api/gmail/connect', { method: 'POST' });
                      signIn('google', { callbackUrl: '/settings' });
                    }}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    连接
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border border-gray-200 rounded">
              <div className="flex-1">
                <div className="font-medium">GitHub</div>
                {githubConnected && githubLogin && (
                  <div className="text-sm text-gray-600">@{githubLogin}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded ${
                  githubConnected 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {githubConnected ? '已连接' : '未连接'}
                </span>
                {githubConnected ? (
                  <button
                    onClick={async () => {
                      await fetch('/api/github/disconnect', { method: 'POST' });
                      setGithubConnected(false);
                      setGithubLogin('');
                      router.refresh();
                    }}
                    className="text-xs px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
                  >
                    断开
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await fetch('/api/github/connect', { method: 'POST' });
                      signIn('github', { callbackUrl: '/settings' });
                    }}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    连接
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
