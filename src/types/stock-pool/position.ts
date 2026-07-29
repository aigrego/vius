// 持仓记录（对应 /stock-pool/api/positions 返回项）
export interface Position {
  id: number;
  code: string;
  name: string;
  market: string;
  price: number;    // 买入价
  quantity: number; // 买入数量（股）
  status: 'holding' | 'sold'; // 持仓中 / 已卖出
  sellPrice: number | null;   // 卖出价（sold 时有值）
  soldAt: string | null;      // 卖出时间（sold 时有值）
  createdAt: string;
  updatedAt: string;
  // 实时数据合并字段（可选，仅 holding 行有）
  current?: number;
  changePct?: number;
}

export interface PositionStats {
  records: number;        // 买入记录数
  stocks: number;         // 持仓股票数（去重）
  totalCost: number;      // 总投入 = Σ(price × quantity)
  totalValue: number;     // 总市值 = Σ(current × quantity)，无实时数据时为 0
  totalPnl: number;       // 总浮动盈亏 = totalValue - totalCost
  totalPnlPct: number;    // 总盈亏比例
  realizedPnl: number;    // 已实现盈亏 = Σ(sellPrice − price) × quantity（sold 行）
}
