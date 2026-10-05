import Link from 'next/link';
import { cookies } from 'next/headers';
import { initializeModules } from '@/modules';
import { getEnabledModules } from '@/lib/module-registry';
import { getUserSettingsFromCookie } from '@/lib/user-settings';
import { ModuleCard } from './components/ModuleCard';
import { getGmailStatus } from '@/lib/connectors/gmail';
import { getGithubStatus } from '@/lib/connectors/github';
import { ThemeToggle } from './components/ThemeToggle';

initializeModules();

export default async function HomePage() {
  const cookieStore = await cookies();
  const settingsCookie = cookieStore.get('user_settings');
  const userSettings = getUserSettingsFromCookie(settingsCookie?.value);
  
  const enabledModules = getEnabledModules(userSettings);

  const demoModeCookie = cookieStore.get('demo_mode');
  const demoMode = demoModeCookie?.value || undefined;
  
  const gmailStatus = await getGmailStatus();
  const githubStatus = await getGithubStatus();
  
  const connectors = {
    gmail: demoMode === 'disconnected' ? { ready: false } : gmailStatus,
    github: demoMode === 'disconnected' ? { ready: false } : githubStatus,
  };

  const moduleContext = { 
    settings: userSettings, 
    connectors,
    demoMode: demoMode as 'normal' | 'disconnected' | 'empty' | undefined,
  };

  const moduleResults = await Promise.allSettled(
    enabledModules.map(async (module) => ({
      id: module.manifest.id,
      manifest: module.manifest,
      result: await module.load(moduleContext),
      Card: module.Card,
    }))
  );

  const modules = moduleResults
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<any>).value);

  const leftModules = modules
    .filter(m => m.manifest.layout.column === 'left')
    .sort((a, b) => a.manifest.layout.priority - b.manifest.layout.priority);
  
  const rightModules = modules
    .filter(m => m.manifest.layout.column === 'right')
    .sort((a, b) => a.manifest.layout.priority - b.manifest.layout.priority);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好';
  const dateStr = now.toLocaleDateString('zh-CN', { 
    month: 'long', 
    day: 'numeric', 
    weekday: 'long' 
  }).replace(/(\d+)月(\d+)日/, '$1月$2日 ');

  const mailModule = modules.find(m => m.id === 'mail-todos');
  const githubModule = modules.find(m => m.id === 'github-activity');
  
  let unreadCount = 0;
  let githubActivityCount = 0;
  
  if (mailModule?.result.status === 'ok') {
    unreadCount = mailModule.result.data.totalCount || 0;
  }
  
  if (githubModule?.result.status === 'ok') {
    githubActivityCount = githubModule.result.data.summary.commits + 
                         githubModule.result.data.summary.pullRequests + 
                         githubModule.result.data.summary.reviews;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1200px] mx-auto px-8 py-7">
        {/* 顶部导航 */}
        <nav className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent via-up to-[#f472b6]" />
            <h1 className="text-[17px] font-bold">我的聚合</h1>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            <ThemeToggle className="md:hidden" iconOnly />
            <Link
              href="/settings"
              className="px-3 md:px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap
                         bg-card-bg border border-card-border text-foreground
                         hover:bg-tile transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="hidden md:inline">⚙ 设置</span>
              <span className="md:hidden">⚙</span>
            </Link>
            <div className="w-9 h-9 rounded-full bg-foreground text-background
                            flex items-center justify-center font-bold text-sm">
              Q
            </div>
          </div>
        </nav>

        {/* 概览区 Hero */}
        <div className="rounded-hero bg-gradient-to-br from-hero-from to-hero-to
                        border border-card-border p-7 mb-5 flex justify-between items-end">
          <div>
            <div className="text-muted text-sm mb-1">{dateStr}</div>
            <h2 className="text-[28px] font-bold mb-2 tracking-tight">{greeting}，Qinou</h2>
            <div className="text-sm text-muted">
              {unreadCount > 0 && (
                <>
                  今天有 <span className="text-accent font-semibold">{unreadCount}</span> 封未读待处理
                </>
              )}
              {unreadCount > 0 && githubActivityCount > 0 && '，'}
              {githubActivityCount > 0 && (
                <>
                  GitHub 本周 <span className="text-accent font-semibold">{githubActivityCount}</span> 次活动
                </>
              )}
              {!unreadCount && !githubActivityCount && '一切都很平静'}
            </div>
          </div>
        </div>

        {modules.length === 0 ? (
          <div className="bg-card-bg border border-card-border rounded-card p-8 text-center">
            <p className="text-muted mb-4">未启用任何模块</p>
            <Link
              href="/settings"
              className="inline-block px-6 py-2 bg-accent text-background rounded-lg
                         hover:opacity-90 transition font-medium"
            >
              前往设置
            </Link>
          </div>
        ) : (
          <>
            {/* 单份渲染：桌面两列容器各自 flex-col，手机列容器透明用 order 排序 */}
            <div className="flex flex-col lg:grid lg:grid-cols-[1.35fr_1fr] lg:gap-5">
              {/* 左栏容器：手机时透明（contents），桌面时 flex-col */}
              <div className="max-lg:contents lg:flex lg:flex-col lg:gap-5">
                {leftModules.map((module) => (
                  <div
                    key={module.id}
                    style={{ order: module.manifest.layout.mobileOrder }}
                    className="max-lg:mb-5"
                  >
                    <ModuleCard
                      moduleId={module.id}
                      initialResult={module.result}
                      Card={module.Card}
                    />
                  </div>
                ))}
              </div>

              {/* 右栏容器：手机时透明（contents），桌面时 flex-col */}
              <div className="max-lg:contents lg:flex lg:flex-col lg:gap-5">
                {rightModules.map((module) => (
                  <div
                    key={module.id}
                    style={{ order: module.manifest.layout.mobileOrder }}
                    className="max-lg:mb-5"
                  >
                    <ModuleCard
                      moduleId={module.id}
                      initialResult={module.result}
                      Card={module.Card}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 页脚 */}
            <footer className="mt-10 text-center text-xs text-muted">
              模块可在设置中开关
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
