import type { ModuleContext, ModuleLoadResult } from '@/lib/module-types';

export type GithubActivityData = {
  windowDays: 7;
  summary: { commits: number; pullRequests: number; reviews: number };
  items: Array<{
    id: string;
    repo: string;
    type: 'commit' | 'pr' | 'review' | 'issue' | 'other';
    title: string;
    at: string;
    url: string;
  }>;
  login: string;
};

export async function load(ctx: ModuleContext): Promise<ModuleLoadResult<GithubActivityData>> {
  // 检查 GitHub 连接状态
  if (!ctx.connectors.github?.ready) {
    return { status: 'disconnected', connector: 'github' };
  }

  const login = ctx.connectors.github.displayName || 'Avocado-0324';

  // M0: 返回 mock 数据
  // M1+ 将接入真实 GitHub API
  const mockData: GithubActivityData = {
    windowDays: 7,
    summary: {
      commits: 12,
      pullRequests: 3,
      reviews: 5,
    },
    items: [
      {
        id: '1',
        repo: 'personal-dashboard',
        type: 'commit',
        title: '添加模块系统基础架构',
        at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        url: 'https://github.com/Avocado-0324/personal-dashboard',
      },
      {
        id: '2',
        repo: 'project-alpha',
        type: 'pr',
        title: 'Feature: 实现用户认证模块',
        at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        url: 'https://github.com/Avocado-0324/project-alpha',
      },
      {
        id: '3',
        repo: 'open-source-lib',
        type: 'review',
        title: 'Review: 优化性能问题',
        at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        url: 'https://github.com/community/open-source-lib',
      },
    ],
    login,
  };

  return {
    status: 'ok',
    data: mockData,
    fetchedAt: new Date().toISOString(),
  };
}
