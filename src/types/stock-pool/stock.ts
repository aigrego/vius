export interface Stock {
  id?: number;
  code: string;
  name: string;
  market: 'sh' | 'sz' | 'hk' | 'us' | 'bj' | 'fx';
  type: 'individual' | 'etf' | 'gold';
  cost: number;
  alerts: StockAlerts;
  created_at?: string;
  updated_at?: string;
  // 实时数据字段（可选）
  current?: number;
  change?: number;
  changePct?: number;
  pnlPct?: number;
  pnlAmount?: number;
}

// 前端展示用的指数/股票基础信息（对应 /api/stocks 返回项），
// 前端组件通过它引用，避免直接 import @/model/Stock（含 Prisma 类型）
export interface TStock {
  code: string;
  source: string;
  type: string;
}

export interface StockAlerts {
  cost_pct_above?: number;
  cost_pct_below?: number;
  change_pct_above?: number;
  change_pct_below?: number;
  volume_ratio?: number;
  ma_monitor?: boolean;
  rsi_monitor?: boolean;
  gap_monitor?: boolean;
  trailing_stop?: boolean;
}

export interface StockStats {
  total: number;
  withPosition: number;
  etfs: number;
  hkUs: number;
}

export type MarketType = 'sh' | 'sz' | 'hk' | 'us' | 'bj' | 'fx';
export type StockType = 'individual' | 'etf' | 'gold';

export const MarketLabels: Record<MarketType, string> = {
  sh: '上海',
  sz: '深圳',
  hk: '港股',
  us: '美股',
  bj: '北交所',
  fx: '外汇'
};

export const TypeLabels: Record<StockType, string> = {
  individual: '个股',
  etf: 'ETF',
  gold: '黄金'
};

export const DefaultAlerts: StockAlerts = {
  cost_pct_above: 15,
  cost_pct_below: -12,
  change_pct_above: 4,
  change_pct_below: -4,
  volume_ratio: 2,
  ma_monitor: true,
  rsi_monitor: true,
  gap_monitor: true,
  trailing_stop: false
};
