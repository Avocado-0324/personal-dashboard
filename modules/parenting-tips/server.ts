import type { ModuleContext, ModuleLoadResult } from '@/lib/module-types';
import type { ParentingTipsData } from './types';

// 静态内容池（M0）
const tipsPool = [
  {
    id: 't1',
    title: '建立规律的睡眠时间',
    summary: '每天在相同时间哄睡，帮助宝宝建立生物钟，提高睡眠质量。',
    theme: 'sleep' as const,
  },
  {
    id: 't2',
    title: '辅食添加的信号',
    summary: '当宝宝能够坐稳、对食物表现出兴趣时，可以开始尝试添加辅食。',
    theme: 'feeding' as const,
  },
  {
    id: 't3',
    title: '亲子互动游戏',
    summary: '通过简单的躲猫猫游戏，促进宝宝的认知发展和情感联结。',
    theme: 'play' as const,
  },
  {
    id: 't4',
    title: '关注宝宝的情绪表达',
    summary: '及时回应宝宝的哭声和笑声，帮助建立安全依恋关系。',
    theme: 'emotion' as const,
  },
  {
    id: 't5',
    title: '定期健康检查',
    summary: '按照儿科医生建议，定期进行生长发育评估和疫苗接种。',
    theme: 'health' as const,
  },
  {
    id: 't6',
    title: '户外活动的重要性',
    summary: '适度的户外活动有助于宝宝的视觉发展和免疫系统建立。',
    theme: 'general' as const,
  },
];

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

  // M0: 简单随机选择 2-3 条
  // M1+: 根据 ageBand 和 themes 做筛选
  let selectedTips = [...tipsPool];
  
  if (themes && themes.length > 0) {
    selectedTips = selectedTips.filter((tip) => 
      tip.theme === 'general' || themes.includes(tip.theme as any)
    );
  }

  // 随机选择 2-3 条
  const count = Math.floor(Math.random() * 2) + 2;
  selectedTips = selectedTips
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(count, selectedTips.length));

  if (selectedTips.length === 0) {
    return {
      status: 'empty',
      hint: '未找到匹配的育儿建议，请调整筛选主题',
    };
  }

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
