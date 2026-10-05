import type { ModuleManifest } from '@/lib/module-types';

export const manifest: ModuleManifest = {
  id: 'portfolio',
  name: '持仓',
  description: '资产持仓管理',
  version: '0.1.0',
  defaultEnabled: false,
  requires: [],
  configKeys: [],
  layout: { column: 'right', priority: 10, mobileOrder: 20 },
};
