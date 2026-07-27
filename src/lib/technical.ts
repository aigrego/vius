export interface KLineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MAData {
  date: string;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
}

export interface MACDData {
  date: string;
  dif: number;
  dea: number;
  macd: number;
}

export interface RSIData {
  date: string;
  rsi6: number;
  rsi12: number;
  rsi24: number;
}

export interface BollingerData {
  date: string;
  upper: number;
  middle: number;
  lower: number;
}

export interface Pattern {
  date: string;
  pattern: string;
  significance: 'low' | 'medium' | 'high';
}

export interface IndicatorResult {
  ma: MAData[];
  macd: MACDData[];
  rsi: RSIData[];
  bollinger: BollingerData[];
  patterns: Pattern[];
}

// 计算移动平均线
function calculateMA(data: KLineData[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(undefined);
      continue;
    }
    
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j]!.close;
    }
    result.push(sum / period);
  }
  
  return result;
}

// 计算 MACD
function calculateMACD(data: KLineData[]): MACDData[] {
  const fastPeriod = 12;
  const slowPeriod = 26;
  const signalPeriod = 9;
  
  const closes = data.map(d => d.close);
  
  // 计算 EMA
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);
  
  const dif = emaFast.map((fast, i) => fast - emaSlow[i]!);
  const dea = calculateEMA(dif, signalPeriod);
  
  return data.map((d, i) => ({
    date: d.date,
    dif: dif[i]!,
    dea: dea[i]!,
    macd: (dif[i]! - dea[i]!) * 2
  }));
}

// 计算 EMA
function calculateEMA(data: number[], period: number): number[] {
  const multiplier = 2 / (period + 1);
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(data[0]!);
    } else {
      result.push((data[i]! - result[i - 1]!) * multiplier + result[i - 1]!);
    }
  }
  
  return result;
}

// 计算 RSI
function calculateRSI(data: KLineData[], period: number): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < data.length; i++) {
    const change = data[i]!.close - data[i - 1]!.close;
    gains.push(Math.max(0, change));
    losses.push(Math.max(0, -change));
  }
  
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      rsi.push(50); // 默认中性值
      continue;
    }
    
    let avgGain = 0;
    let avgLoss = 0;
    
    for (let j = i - period; j < i; j++) {
      avgGain += gains[j] || 0;
      avgLoss += losses[j] || 0;
    }
    
    avgGain /= period;
    avgLoss /= period;
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
}

// 计算布林带
function calculateBollinger(data: KLineData[], period = 20, multiplier = 2): BollingerData[] {
  const result: BollingerData[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push({
        date: data[i]!.date,
        upper: data[i]!.close,
        middle: data[i]!.close,
        lower: data[i]!.close
      });
      continue;
    }
    
    const slice = data.slice(i - period + 1, i + 1) as KLineData[];
    const middle = slice.reduce((sum, d) => sum + d.close, 0) / period;
    
    const squaredDiffs = slice.map(d => Math.pow(d.close - middle, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / period;
    const stdDev = Math.sqrt(variance);
    
    result.push({
      date: data[i]!.date,
      upper: middle + multiplier * stdDev,
      middle,
      lower: middle - multiplier * stdDev
    });
  }
  
  return result;
}

// 识别形态
function detectPatterns(data: KLineData[]): Pattern[] {
  const patterns: Pattern[] = [];
  
  for (let i = 2; i < data.length; i++) {
    const prev = data[i - 1]!;
    const curr = data[i]!;
    const prev2 = data[i - 2]!;
    
    // 锤子线
    const bodySize = Math.abs(curr.close - curr.open);
    const lowerShadow = Math.min(curr.open, curr.close) - curr.low;
    const upperShadow = curr.high - Math.max(curr.open, curr.close);
    
    if (lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5) {
      patterns.push({
        date: curr.date,
        pattern: '锤子线',
        significance: 'medium'
      });
    }
    
    // 看涨吞没
    if (prev.close < prev.open && curr.close > curr.open && 
        curr.open < prev.close && curr.close > prev.open) {
      patterns.push({
        date: curr.date,
        pattern: '看涨吞没',
        significance: 'high'
      });
    }
    
    // 看跌吞没
    if (prev.close > prev.open && curr.close < curr.open && 
        curr.open > prev.close && curr.close < prev.open) {
      patterns.push({
        date: curr.date,
        pattern: '看跌吞没',
        significance: 'high'
      });
    }
    
    // 早晨之星（简化版）
    if (i >= 2 && 
        prev2.close < prev2.open && 
        Math.abs(prev.close - prev.open) < Math.abs(prev2.close - prev2.open) * 0.3 &&
        curr.close > curr.open && curr.close > (prev2.open + prev2.close) / 2) {
      patterns.push({
        date: curr.date,
        pattern: '早晨之星',
        significance: 'high'
      });
    }
  }
  
  return patterns;
}

// 计算所有指标
export function calculateAllIndicators(data: KLineData[]): IndicatorResult {
  if (data.length < 60) {
    return {
      ma: [],
      macd: [],
      rsi: [],
      bollinger: [],
      patterns: []
    };
  }
  
  const ma5 = calculateMA(data, 5);
  const ma10 = calculateMA(data, 10);
  const ma20 = calculateMA(data, 20);
  const ma60 = calculateMA(data, 60);
  
  const ma: MAData[] = data.map((d, i) => ({
    date: d.date,
    ma5: ma5[i],
    ma10: ma10[i],
    ma20: ma20[i],
    ma60: ma60[i]
  }));
  
  const macd = calculateMACD(data);
  
  const rsi6 = calculateRSI(data, 6);
  const rsi12 = calculateRSI(data, 12);
  const rsi24 = calculateRSI(data, 24);
  
  const rsi: RSIData[] = data.map((d, i) => ({
    date: d.date,
    rsi6: rsi6[i]!,
    rsi12: rsi12[i]!,
    rsi24: rsi24[i]!
  }));
  
  const bollinger = calculateBollinger(data);
  const patterns = detectPatterns(data);
  
  return {
    ma,
    macd,
    rsi,
    bollinger,
    patterns
  };
}
