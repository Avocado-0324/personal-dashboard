import { manifest } from './manifest';
import { loadPortfolioData, loadSummary } from './server';
import { PortfolioCard } from './ui';
import { isDatabaseConfigured } from '@/db/client';
import type { ModuleContract, ModuleLoadResult } from '@/lib/module-types';
import type { PortfolioData } from './types';

async function load(): Promise<ModuleLoadResult<PortfolioData>> {
  try {
    if (!isDatabaseConfigured()) {
      return {
        status: 'error',
        message: '数据库未配置',
        retryable: true,
      };
    }

    const data = await loadPortfolioData();
    
    if (!data) {
      return { status: 'empty' };
    }

    return {
      status: 'ok',
      data,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Portfolio load error:', error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : '加载失败',
      retryable: true,
    };
  }
}

export const portfolioModule: ModuleContract<PortfolioData> = {
  manifest,
  load,
  Card: PortfolioCard,
};

export { loadSummary };
