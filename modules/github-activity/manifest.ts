import type { ModuleManifest } from '@/lib/module-types';

export const manifest: ModuleManifest = {
  id: 'github-activity',
  name: 'GitHub 活跃度',
  description: '最近7天的代码活动',
  version: '0.1.0',
  defaultEnabled: true,
  requires: ['github'],
  configKeys: [],
  layout: { column: 'left', priority: 20 },
};
