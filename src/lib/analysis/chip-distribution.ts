// 筹码分布（近似计算，三角衰减模型）
// 原理：每天按 (1 - 当日换手率/100) 比例衰减历史筹码，当日换手的筹码按三角分布
// 铺在 [low, high] 区间（峰值在当日均价），最终归一化得到各价格格的筹码占比

export interface ChipDailyBar {
  close: number;
  high: number;
  low: number;
  volume: number; // 单位：手（1手=100股）
  amount: number; // 单位：元
  turnover: number | null; // 换手率 %
}

export interface ChipBin {
  price: number; // 价格格中心
  ratio: number; // 筹码占比（总和为 1）
}

export interface ChipDistribution {
  bins: ChipBin[];
  profitRatio: number; // 现价以下筹码占比（获利盘比例）
  avgCost: number; // 平均持仓成本
  cost90: { low: number; high: number }; // 90% 筹码集中区间
  cost70: { low: number; high: number }; // 70% 筹码集中区间
}

const BIN_COUNT = 60; // 价格轴格数

// 输入按日期升序的日线（含换手率），currentPrice 缺省取最后一根收盘价
export function calculateChipDistribution(
  dailies: ChipDailyBar[],
  currentPrice?: number
): ChipDistribution | null {
  if (dailies.length === 0) return null;

  // 价格轴：min(low) ~ max(high) 分 60 格
  let minLow = Infinity;
  let maxHigh = -Infinity;
  for (const d of dailies) {
    if (d.low < minLow) minLow = d.low;
    if (d.high > maxHigh) maxHigh = d.high;
  }
  if (!(maxHigh > minLow) || !Number.isFinite(minLow)) return null;

  const binWidth = (maxHigh - minLow) / BIN_COUNT;
  const chips = new Array<number>(BIN_COUNT).fill(0);

  for (const day of dailies) {
    // 换手率缺失时跳过该日：筹码不衰减也不新增
    if (day.turnover == null || !Number.isFinite(day.turnover) || day.turnover <= 0) continue;
    // 换手超过 100% 按 100% 处理（历史筹码全部置换）
    const t = Math.min(day.turnover, 100) / 100;

    // 历史筹码按 (1 - 当日换手率/100) 比例衰减留存
    for (let i = 0; i < BIN_COUNT; i++) {
      chips[i]! *= 1 - t;
    }

    // 当日均价：amount / (volume*100)，除零兜底用 (high+low+close)/3
    const avgPrice = day.volume > 0
      ? day.amount / (day.volume * 100)
      : (day.high + day.low + day.close) / 3;
    const peak = Math.min(Math.max(avgPrice, day.low), day.high);

    // 当日换手筹码按三角分布铺在 [low, high]，峰值在均价
    const weights = new Array<number>(BIN_COUNT).fill(0);
    let weightSum = 0;
    for (let i = 0; i < BIN_COUNT; i++) {
      const price = minLow + (i + 0.5) * binWidth;
      if (price < day.low || price > day.high) continue;
      let w: number;
      if (price <= peak) {
        w = peak > day.low ? (price - day.low) / (peak - day.low) : 1;
      } else {
        w = day.high > peak ? (day.high - price) / (day.high - peak) : 1;
      }
      weights[i] = Math.max(w, 0);
      weightSum += weights[i]!;
    }
    if (weightSum <= 0) continue;
    for (let i = 0; i < BIN_COUNT; i++) {
      chips[i]! += (weights[i]! / weightSum) * t;
    }
  }

  const total = chips.reduce((acc, v) => acc + v, 0);
  if (total <= 0) return null;

  // 归一化到总和 1
  const bins: ChipBin[] = chips.map((v, i) => ({
    price: minLow + (i + 0.5) * binWidth,
    ratio: v / total
  }));

  const price = currentPrice ?? dailies[dailies.length - 1]!.close;

  // 获利盘比例：现价以下筹码占比
  let profitRatio = 0;
  let avgCost = 0;
  for (const bin of bins) {
    if (bin.price <= price) profitRatio += bin.ratio;
    avgCost += bin.price * bin.ratio;
  }

  // 成本区间：累积分布的中间 q 部分（cost90 取 5%~95%，cost70 取 15%~85%）
  const costRange = (q: number): { low: number; high: number } => {
    const tail = (1 - q) / 2;
    let low = bins[bins.length - 1]!.price;
    let high = bins[0]!.price;
    let cumulative = 0;
    let lowFound = false;
    for (const bin of bins) {
      cumulative += bin.ratio;
      if (!lowFound && cumulative >= tail) {
        low = bin.price;
        lowFound = true;
      }
      if (cumulative >= 1 - tail) {
        high = bin.price;
        break;
      }
    }
    return { low, high };
  };

  return {
    bins,
    profitRatio: Math.round(profitRatio * 10000) / 10000,
    avgCost: Math.round(avgCost * 100) / 100,
    cost90: costRange(0.9),
    cost70: costRange(0.7)
  };
}
