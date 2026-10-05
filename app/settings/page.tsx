'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { getUserSettings, toggleModule, updateUserSettings } from '@/lib/user-settings';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut, signIn } from 'next-auth/react';
import { ThemeToggle } from '../components/ThemeToggle';

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
  {
    manifest: {
      id: 'portfolio' as const,
      name: '持仓',
      description: '资产持仓管理（敏感模块，默认关闭）',
      requires: [],
    }
  },
];

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

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState(getUserSettings());
  const [demoMode, setDemoMode] = useState<'normal' | 'disconnected' | 'empty'>('normal');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState('');
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubLogin, setGithubLogin] = useState('');
  
  const errorParam = searchParams.get('error');
  const successParam = searchParams.get('success');

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
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    document.cookie = `demo_mode=${mode}; path=/; expires=${expires.toUTCString()}`;
    setTimeout(() => router.refresh(), 100);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1000px] mx-auto px-8 py-7">
        {/* 顶部导航 */}
        <nav className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent via-up to-[#f472b6]" />
            <h1 className="text-[17px] font-bold">设置</h1>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
            <ThemeToggle />
            <Link
              href="/"
              className="px-3 md:px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap
                         bg-card-bg border border-card-border text-foreground
                         hover:bg-tile transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="hidden md:inline">返回首页</span>
              <span className="md:hidden">首页</span>
            </Link>
            <button
              onClick={async () => {
                await fetch('/api/github/disconnect', { method: 'POST' });
                await signOut({ callbackUrl: '/auth/signin' });
              }}
              className="px-3 md:px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap
                         bg-down/15 text-down border border-down/30
                         hover:bg-down/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-down"
            >
              登出
            </button>
          </div>
        </nav>

        {/* 主内容区 */}
        <main className="space-y-5">
          {/* 错误和成功消息 */}
          {errorParam && (
            <div className="bg-down/10 border border-down/30 rounded-card p-4">
              <p className="text-down">{errorParam}</p>
            </div>
          )}
          {successParam === 'github_connected' && (
            <div className="bg-up/10 border border-up/30 rounded-card p-4">
              <p className="text-up">GitHub 已成功连接</p>
            </div>
          )}

          {/* 模块开关 */}
          <section className="bg-card-bg border border-card-border rounded-card p-6">
            <h2 className="text-lg font-bold mb-4">模块管理</h2>
            <div className="space-y-3">
              {allModulesConfig.map((module) => {
                const enabled = settings.modules[module.manifest.id]?.enabled !== false;
                return (
                  <div
                    key={module.manifest.id}
                    className="flex items-center justify-between p-4 border border-card-border rounded-xl
                               hover:bg-tile/50 transition"
                  >
                    <div className="flex-1">
                      <h3 className="font-medium">{module.manifest.name}</h3>
                      <p className="text-sm text-muted">{module.manifest.description}</p>
                      {module.manifest.requires.length > 0 && (
                        <p className="text-xs text-muted mt-1">
                          需要: {module.manifest.requires.join(', ')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleToggleModule(module.manifest.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        enabled ? 'bg-accent' : 'bg-tile'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
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
          <section className="bg-card-bg border border-card-border rounded-card p-6">
            <h2 className="text-lg font-bold mb-2">演示模式（M0 测试）</h2>
            <p className="text-sm text-muted mb-4">
              用于测试模块的不同状态（断连、空数据等）
            </p>
            <div className="space-y-2">
              <button
                onClick={() => handleDemoModeChange('normal')}
                className={`w-full px-4 py-3 rounded-xl border text-left transition
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  demoMode === 'normal'
                    ? 'bg-accent/10 border-accent text-foreground'
                    : 'bg-card-bg border-card-border hover:bg-tile'
                }`}
              >
                <div className="font-medium">正常模式</div>
                <div className="text-sm text-muted">显示 mock 数据</div>
              </button>
              <button
                onClick={() => handleDemoModeChange('disconnected')}
                className={`w-full px-4 py-3 rounded-xl border text-left transition
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  demoMode === 'disconnected'
                    ? 'bg-accent/10 border-accent text-foreground'
                    : 'bg-card-bg border-card-border hover:bg-tile'
                }`}
              >
                <div className="font-medium">断连模式</div>
                <div className="text-sm text-muted">模拟 Gmail/GitHub 未连接</div>
              </button>
              <button
                onClick={() => handleDemoModeChange('empty')}
                className={`w-full px-4 py-3 rounded-xl border text-left transition
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  demoMode === 'empty'
                    ? 'bg-accent/10 border-accent text-foreground'
                    : 'bg-card-bg border-card-border hover:bg-tile'
                }`}
              >
                <div className="font-medium">空数据模式</div>
                <div className="text-sm text-muted">模拟无数据状态</div>
              </button>
            </div>
          </section>

          {/* 育儿配置 */}
          <section className="bg-card-bg border border-card-border rounded-card p-6">
            <h2 className="text-lg font-bold mb-2">育儿配置</h2>
            <p className="text-sm text-muted mb-4">
              根据宝宝年龄段和关注主题，首页将推荐更匹配的育儿建议。跳过配置也可使用，将显示通用建议。
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  宝宝年龄段
                </label>
                <select
                  value={settings.config['parenting.ageBand'] || ''}
                  onChange={(e) => handleUpdateConfig('parenting.ageBand', e.target.value || undefined)}
                  className="w-full px-4 py-2.5 border border-card-border rounded-xl
                             bg-card-bg text-foreground
                             focus:outline-none focus:ring-2 focus:ring-accent"
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
                <label className="block text-sm font-medium mb-2">
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
                        className={`px-4 py-2.5 rounded-xl border transition
                                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          isSelected
                            ? 'bg-accent/10 border-accent text-foreground'
                            : 'bg-card-bg border-card-border hover:bg-tile'
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

          <section className="bg-card-bg border border-card-border rounded-card p-6">
            <h2 className="text-lg font-bold mb-4">连接状态</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 border border-card-border rounded-xl">
                <div className="flex-1">
                  <div className="font-medium">Gmail</div>
                  {gmailConnected && gmailEmail && (
                    <div className="text-sm text-muted">{gmailEmail}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                    gmailConnected 
                      ? 'bg-up/15 text-up' 
                      : 'bg-down/15 text-down'
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
                      className="text-xs px-3 py-1.5 bg-down/15 text-down rounded-lg hover:bg-down/25 transition
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-down"
                    >
                      断开
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        await fetch('/api/gmail/connect', { method: 'POST' });
                        await signIn('google', { callbackUrl: '/settings' });
                      }}
                      className="text-xs px-3 py-1.5 bg-accent text-background rounded-lg hover:opacity-90 transition
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      连接
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between p-4 border border-card-border rounded-xl">
                <div className="flex-1">
                  <div className="font-medium">GitHub</div>
                  {githubConnected && githubLogin && (
                    <div className="text-sm text-muted">@{githubLogin}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                    githubConnected 
                      ? 'bg-up/15 text-up' 
                      : 'bg-down/15 text-down'
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
                      className="text-xs px-3 py-1.5 bg-down/15 text-down rounded-lg hover:bg-down/25 transition
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-down"
                    >
                      断开
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        window.location.href = '/api/connect/github';
                      }}
                      className="text-xs px-3 py-1.5 bg-accent text-background rounded-lg hover:opacity-90 transition
                                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted">加载中...</div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
