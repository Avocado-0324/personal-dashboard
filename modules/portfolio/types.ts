export type PortfolioData = {
  asOf: string; // ISO date
  baseCurrency: 'JPY';
  totalJpy: string;
  netContributionJpy: string;
  pnlJpy: string;
  pnlRatio: string | null;
  xirr: string | null;
  missingFxCount: number;
  allocationByAccount: Array<{
    accountType: string;
    label: string;
    valueJpy: string;
    ratio: string;
  }>;
  allocationByAssetClass: Array<{
    assetClass: string;
    label: string;
    valueJpy: string;
    ratio: string;
  }>;
  topHoldings: Array<{
    symbol: string;
    name: string;
    valueJpy: string;
    unrealizedPnlJpy: string;
    pnlRatio: string;
    accountType: string;
  }>;
  stale: boolean;
};

export type PortfolioSummary = {
  totalJpy: string;
  pnlJpy: string;
  xirr: string | null;
  asOf: string;
  missingFxCount: number;
};

export type AccountType = 'tokutei' | 'nisa_growth' | 'nisa_tsumitate' | 'cash' | 'other';
export type AssetClass = 'jp_stock' | 'us_stock' | 'fund' | 'etf' | 'bond' | 'reit' | 'crypto' | 'other';
export type SnapshotSource = 'manual' | 'csv' | 'screenshot';
export type CashFlowDirection = 'deposit' | 'withdrawal';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  tokutei: '特定',
  nisa_growth: 'NISA 成长',
  nisa_tsumitate: 'NISA 积立',
  cash: '现金',
  other: '其他',
};

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  jp_stock: '日本股票',
  us_stock: '美国股票',
  fund: '投资信托',
  etf: 'ETF',
  bond: '债券',
  reit: 'REIT',
  crypto: '加密货币',
  other: '其他',
};
