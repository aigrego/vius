export interface Alert {
  code: string;
  name: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  currentValue: number;
  thresholdValue: number;
}

export interface AlertConfig {
  code: string;
  name: string;
  cost: number;
  alerts: {
    priceAbove?: number;
    priceBelow?: number;
    changePctAbove?: number;
    changePctBelow?: number;
    volumeAbove?: number;
    lossPctAbove?: number;
    profitPctAbove?: number;
  };
}

export interface QuoteData {
  current: number;
  changePct: number;
  volume: number;
  avgVolume?: number;
}

export function checkStockAlerts(
  stock: AlertConfig,
  quote: QuoteData
): Alert[] {
  const alerts: Alert[] = [];
  const { alerts: config, code, name, cost } = stock;

  // 价格上限预警
  if (config.priceAbove && quote.current >= config.priceAbove) {
    alerts.push({
      code,
      name,
      type: 'priceAbove',
      severity: 'medium',
      message: `${name}(${code}) 价格突破 ${config.priceAbove}，当前 ${quote.current}`,
      currentValue: quote.current,
      thresholdValue: config.priceAbove,
    });
  }

  // 价格下限预警
  if (config.priceBelow && quote.current <= config.priceBelow) {
    alerts.push({
      code,
      name,
      type: 'priceBelow',
      severity: 'high',
      message: `${name}(${code}) 价格跌破 ${config.priceBelow}，当前 ${quote.current}`,
      currentValue: quote.current,
      thresholdValue: config.priceBelow,
    });
  }

  // 涨幅预警
  if (config.changePctAbove && quote.changePct >= config.changePctAbove) {
    alerts.push({
      code,
      name,
      type: 'changePctAbove',
      severity: 'medium',
      message: `${name}(${code}) 涨幅超过 ${config.changePctAbove}%，当前 ${quote.changePct}%`,
      currentValue: quote.changePct,
      thresholdValue: config.changePctAbove,
    });
  }

  // 跌幅预警
  if (config.changePctBelow && quote.changePct <= config.changePctBelow) {
    alerts.push({
      code,
      name,
      type: 'changePctBelow',
      severity: 'high',
      message: `${name}(${code}) 跌幅超过 ${Math.abs(config.changePctBelow)}%，当前 ${quote.changePct}%`,
      currentValue: quote.changePct,
      thresholdValue: config.changePctBelow,
    });
  }

  // 成交量预警
  if (config.volumeAbove && quote.avgVolume && quote.volume >= quote.avgVolume * config.volumeAbove) {
    alerts.push({
      code,
      name,
      type: 'volumeAbove',
      severity: 'low',
      message: `${name}(${code}) 成交量放大，当前 ${(quote.volume / 10000).toFixed(2)}万`,
      currentValue: quote.volume,
      thresholdValue: quote.avgVolume * config.volumeAbove,
    });
  }

  // 亏损预警（基于成本）
  if (cost > 0 && config.lossPctAbove) {
    const lossPct = ((quote.current - cost) / cost) * 100;
    if (lossPct <= -config.lossPctAbove) {
      alerts.push({
        code,
        name,
        type: 'lossPctAbove',
        severity: 'high',
        message: `${name}(${code}) 亏损超过 ${config.lossPctAbove}%，当前 ${lossPct.toFixed(2)}%`,
        currentValue: lossPct,
        thresholdValue: -config.lossPctAbove,
      });
    }
  }

  // 盈利预警（基于成本）
  if (cost > 0 && config.profitPctAbove) {
    const profitPct = ((quote.current - cost) / cost) * 100;
    if (profitPct >= config.profitPctAbove) {
      alerts.push({
        code,
        name,
        type: 'profitPctAbove',
        severity: 'medium',
        message: `${name}(${code}) 盈利超过 ${config.profitPctAbove}%，当前 ${profitPct.toFixed(2)}%`,
        currentValue: profitPct,
        thresholdValue: config.profitPctAbove,
      });
    }
  }

  return alerts;
}
