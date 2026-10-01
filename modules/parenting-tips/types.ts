export type ParentingTipsData = {
  period: 'today';
  items: Array<{
    id: string;
    title: string;
    summary: string;
    theme: 'sleep' | 'feeding' | 'play' | 'health' | 'emotion' | 'general';
  }>;
  personalized: boolean;
};
