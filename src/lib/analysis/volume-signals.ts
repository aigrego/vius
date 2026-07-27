// 底部/顶部放量信号检测
// 位置分位：现价在近 120 日区间中的位置，≤0.2 视为底部区、≥0.8 视为顶部区
// 量比：当日成交量 / 前 20 日均量，≥2 视为放量

import { runWithConcurrency } from '@/lib/eastmoney';
import { getActiveStockBasics } from '@/model/StockBasic';
import { getStockDailies } from '@/model/StockDaily';
import { upsertStockSignals } from '@/model/StockSignal';
import prisma from '@/lib/prisma';

// 阈值常量，导出便于调整
export const VOLUME_RATIO_THRESHOLD = 2; // 量比阈值
export const POSITION_BOTTOM = 0.2; // 底部区分位
export const POSITION_TOP = 0.8; // 顶部分位
export const POSITION_WINDOW = 120; // 位置分位窗口（交易日）
export const AVG_VOLUME_WINDOW = 20; // 均量窗口
export const MIN_BARS = 60; // 参与计算的最少日线根数

export interface VolumeSignalBar {
  date: string | Date;
  close: number;
  high: number;
  low: number;
  volume: number;
  changePct: number;
}

export interface VolumeSignal {
  type: 'bottom_volume' | 'top_volume';
  detail: {
    volumeRatio: number;
    position: number;
    changePct: number;
    close: number;
  };
}

// 输入单股按日期升序的日线数组（至少 60 根），只判断最后一根是否触发信号
export function detectVolumeSignals(dailies: VolumeSignalBar[]): VolumeSignal | null {
  if (dailies.length < MIN_BARS) return null;

  const last = dailies[dailies.length - 1]!;
  if (last.volume <= 0) return null;

  // 前 20 日均量（不含当日）
  const prev = dailies.slice(-(AVG_VOLUME_WINDOW + 1), -1);
  if (prev.length < AVG_VOLUME_WINDOW) return null;
  const avgVolume = prev.reduce((acc, d) => acc + d.volume, 0) / prev.length;
  if (avgVolume <= 0) return null;
  const volumeRatio = last.volume / avgVolume;
  if (volumeRatio < VOLUME_RATIO_THRESHOLD) return null;

  // 近 120 日价格区间位置分位
  const window = dailies.slice(-POSITION_WINDOW);
  let minLow = Infinity;
  let maxHigh = -Infinity;
  for (const d of window) {
    if (d.low < minLow) minLow = d.low;
    if (d.high > maxHigh) maxHigh = d.high;
  }
  if (!(maxHigh > minLow)) return null;
  const position = (last.close - minLow) / (maxHigh - minLow);

  let type: VolumeSignal['type'] | null = null;
  if (position <= POSITION_BOTTOM) type = 'bottom_volume';
  else if (position >= POSITION_TOP) type = 'top_volume';
  if (!type) return null;

  return {
    type,
    detail: {
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      position: Math.round(position * 1000) / 1000,
      changePct: last.changePct,
      close: last.close
    }
  };
}

// 对当日有日线的全部在市股票计算放量信号并落库
export async function runVolumeSignalJob(date: string): Promise<{ checked: number; signaled: number }> {
  const target = new Date(`${date}T00:00:00.000Z`);
  // 当日有日线的在市股票
  const [actives, dailies] = await Promise.all([
    getActiveStockBasics(),
    prisma.stockDaily.findMany({ where: { date: target }, select: { code: true } })
  ]);
  const activeCodes = new Set(actives.map(a => a.code));
  const codes = dailies.map(d => d.code).filter(code => activeCodes.has(code));

  let signaled = 0;
  await runWithConcurrency(codes, 5, async code => {
    try {
      // 取近 130 根（计算需要 120 日窗口 + 20 日均量），转成日期升序
      const rows = await getStockDailies(code, 130);
      const bars: VolumeSignalBar[] = rows.reverse().map(r => ({
        date: r.date,
        close: r.close,
        high: r.high,
        low: r.low,
        volume: r.volume,
        changePct: r.changePct
      }));
      const signal = detectVolumeSignals(bars);
      if (!signal) return;
      await upsertStockSignals([{
        code,
        date,
        type: signal.type,
        detail: JSON.stringify(signal.detail)
      }]);
      signaled += 1;
    } catch (error) {
      console.error(`[volume-signal] ${code} 计算失败:`, error);
    }
  });

  console.log(`[volume-signal] ${date} 检查 ${codes.length} 只，触发 ${signaled} 只`);
  return { checked: codes.length, signaled };
}
