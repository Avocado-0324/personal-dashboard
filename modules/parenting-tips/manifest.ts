import type { ModuleManifest } from '@/lib/module-types';

export const manifest: ModuleManifest = {
  id: 'parenting-tips',
  name: '育儿 Tips',
  description: '个性化育儿建议',
  version: '0.1.0',
  defaultEnabled: true,
  requires: [],
  configKeys: ['parenting.ageBand', 'parenting.themes'],
  layout: { column: 'right', priority: 20, mobileOrder: 30 },
};
