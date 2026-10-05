// 模块类型定义 - 基于架构契约 v0.2

export type ModuleId = 'mail-todos' | 'parenting-tips' | 'github-activity';
export type ConnectorId = 'gmail' | 'github';

export type ModuleManifest = {
  id: ModuleId;
  name: string;
  description: string;
  version: string;
  defaultEnabled: boolean;
  requires: ConnectorId[];
  configKeys: string[];
  layout: { column: 'left' | 'right'; priority: number; mobileOrder: number };
};

export type UserSettings = {
  onboardingCompleted: boolean;
  modules: Record<ModuleId, { enabled: boolean }>;
  config: {
    'parenting.ageBand'?: '0-6m' | '6-12m' | '1-2y' | '2-3y' | '3y+';
    'parenting.themes'?: Array<'sleep' | 'feeding' | 'play' | 'health' | 'emotion'>;
  };
};

export type ModuleContext = {
  settings: UserSettings;
  connectors: Partial<Record<ConnectorId, { ready: boolean; displayName?: string }>>;
  demoMode?: 'normal' | 'disconnected' | 'empty';
};

export type ModuleStatus = 'ok' | 'unconfigured' | 'disconnected' | 'empty' | 'error';

export type ModuleLoadResult<T> =
  | { status: 'ok'; data: T; fetchedAt: string }
  | { status: 'unconfigured' }
  | { status: 'disconnected'; connector: ConnectorId }
  | { status: 'empty'; hint?: string }
  | { status: 'error'; message: string; retryable: true };

export type ModuleContract<T = any> = {
  manifest: ModuleManifest;
  load(ctx: ModuleContext): Promise<ModuleLoadResult<T>>;
  Card: React.ComponentType<{ result: ModuleLoadResult<T>; onRefresh: () => void }>;
};
