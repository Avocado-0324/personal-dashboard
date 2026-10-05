import type { ModuleContext, ModuleLoadResult } from '@/lib/module-types';
import type { GithubActivityData } from './types';
import { fetchGithubActivity } from '@/lib/connectors/github';

export async function load(ctx: ModuleContext): Promise<ModuleLoadResult<GithubActivityData>> {
  if (!ctx.connectors.github?.ready) {
    return { status: 'disconnected', connector: 'github' };
  }

  if (ctx.demoMode === 'empty') {
    return { status: 'empty', hint: '最近7天无活动' };
  }

  try {
    const { activities, summary, login } = await fetchGithubActivity();

    if (activities.length === 0 && summary.commits === 0 && summary.pullRequests === 0 && summary.reviews === 0) {
      return { status: 'empty', hint: '最近7天无活动' };
    }

    const data: GithubActivityData = {
      windowDays: 7,
      summary,
      items: activities,
      login,
    };

    return {
      status: 'ok',
      data,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof Error && (error as any).code === 'GITHUB_UNAUTHORIZED') {
      return { status: 'disconnected', connector: 'github' };
    }
    
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to fetch GitHub activity',
      retryable: true,
    };
  }
}
