import type { ModuleContext, ModuleLoadResult } from '@/lib/module-types';
import type { ParentingTipsData } from './types';
import fs from 'fs';
import path from 'path';

type TipPoolItem = {
  id: string;
  title: string;
  summary: string;
  theme: 'sleep' | 'feeding' | 'play' | 'health' | 'emotion';
  ageBands: Array<'0-6m' | '6-12m' | '1-2y' | '2-3y' | '3y+'>;
};

let tipsPool: TipPoolItem[] | null = null;

function loadTipsPool(): TipPoolItem[] {
  if (tipsPool === null) {
    const filePath = path.join(process.cwd(), 'modules/parenting-tips/data/tips.json');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    tipsPool = JSON.parse(fileContent);
  }
  return tipsPool!;
}

export async function load(ctx: ModuleContext): Promise<ModuleLoadResult<ParentingTipsData>> {
  const ageBand = ctx.settings.config['parenting.ageBand'];
  const themes = ctx.settings.config['parenting.themes'];

  const personalized = !!(ageBand || (themes && themes.length > 0));

  // 演示模式：空状态
  if (ctx.demoMode === 'empty') {
    return {
      status: 'empty',
      hint: '未找到匹配的育儿建议（演示模式）',
    };
  }

  // 加载静态内容池
  const allTips = loadTipsPool();
  
  // 按配置筛选
  let selectedTips = [...allTips];
  
  // 按年龄段筛选
  if (ageBand) {
    selectedTips = selectedTips.filter((tip) => 
      tip.ageBands.includes(ageBand)
    );
  }
  
  // 按主题筛选
  if (themes && themes.length > 0) {
    selectedTips = selectedTips.filter((tip) => 
      themes.includes(tip.theme)
    );
  }

  // 筛选后无结果
  if (selectedTips.length === 0) {
    return {
      status: 'empty',
      hint: '未找到匹配的育儿建议，请调整年龄段或主题设置',
    };
  }

  // 随机选择 1-3 条
  const count = Math.floor(Math.random() * 3) + 1;
  selectedTips = selectedTips
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(count, selectedTips.length));

  return {
    status: 'ok',
    data: {
      period: 'today',
      items: selectedTips,
      personalized,
    },
    fetchedAt: new Date().toISOString(),
  };
}
