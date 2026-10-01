import Link from 'next/link';
import { cookies } from 'next/headers';
import { initializeModules } from '@/modules';
import { getEnabledModules } from '@/lib/module-registry';
import { getUserSettingsFromCookie } from '@/lib/user-settings';
import { ModuleCard } from './components/ModuleCard';
import { getGmailStatus } from '@/lib/connectors/gmail';

initializeModules();

export default async function HomePage() {
  const cookieStore = await cookies();
  const settingsCookie = cookieStore.get('user_settings');
  const userSettings = getUserSettingsFromCookie(settingsCookie?.value);
  
  const enabledModules = getEnabledModules(userSettings);

  const demoModeCookie = cookieStore.get('demo_mode');
  const demoMode = demoModeCookie?.value || undefined;
  
  const gmailStatus = await getGmailStatus();
  
  const connectors = {
    gmail: gmailStatus,
    github: demoMode === 'disconnected' 
      ? { ready: false } 
      : { ready: true, displayName: 'Avocado-0324' }
  };

  const moduleContext = { 
    settings: userSettings, 
    connectors,
    demoMode: demoMode as 'normal' | 'disconnected' | 'empty' | undefined,
  };

  const moduleResults = await Promise.allSettled(
    enabledModules.map(async (module) => ({
      id: module.manifest.id,
      result: await module.load(moduleContext),
      Card: module.Card,
    }))
  );

  const modules = moduleResults
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<any>).value);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 顶栏 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">我的聚合</h1>
          <Link
            href="/settings"
            className="text-sm text-blue-600 hover:text-blue-800 px-4 py-2 rounded hover:bg-blue-50"
          >
            设置
          </Link>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {modules.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">未启用任何模块</p>
            <Link
              href="/settings"
              className="inline-block px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              前往设置
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {modules.map((module) => (
              <ModuleCard
                key={module.id}
                moduleId={module.id}
                initialResult={module.result}
                Card={module.Card}
              />
            ))}
          </div>
        )}
      </main>

      {/* 页脚 */}
      <footer className="max-w-4xl mx-auto px-4 py-8 text-center text-sm text-gray-500">
        <p>个人聚合页 v0.1 · M0 脚手架</p>
      </footer>
    </div>
  );
}
