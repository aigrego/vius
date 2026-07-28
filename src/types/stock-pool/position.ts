// 持仓记录（对应 /stock-pool/api/positions 返回项）
export interface Position {
  id: number;
  code: string;
  name: string;
  market: string;
  price: number;    // 买入价
  quantity: number; // 买入数量（股）
  createdAt: string;
  updatedAt: string;
  // 实时数据合并字段（可选）
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
}
