import type { ModuleManifest } from '@/lib/module-types';

export const manifest: ModuleManifest = {
  id: 'mail-todos',
  name: '邮件待办',
  description: '收件箱未读邮件',
  version: '0.1.0',
  defaultEnabled: true,
  requires: ['gmail'],
  configKeys: [],
  layout: { minWidth: 'full', priority: 10 },
};
