// 龙虎榜同步任务：从启用的数据源（东方财富 datacenter）拉取某日个股榜单+席位明细落库
// 由 scheduler 的 sync-lhb 任务（工作日 17:30）或手动 POST /api/ashare/sync?type=lhb 触发

import { fetchLhbDay } from '@/lib/lhb';
import { replaceLhbDay } from '@/model/Lhb';
import { listEnabledLhbSources, createLhbSource, markLhbSourceSync } from '@/model/LhbSource';
import { tradingDaysBetween } from '@/lib/trading-days';

// 东财 datacenter 接口地址（数据源记录的 url 缺省时用此默认值）
const EASTMONEY_DC_URL = 'https://datacenter-web.eastmoney.com/api/data/v1/get';

// 北京时区当日日期（YYYY-MM-DD）
const getBeijingDateStr = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });

// 首次运行时库里没有任何数据源，自动补一条默认的东方财富龙虎榜
const ensureDefaultSource = async (): Promise<void> => {
  await createLhbSource({
    name: '东方财富龙虎榜',
    type: 'api',
    url: EASTMONEY_DC_URL,
    description: '东方财富网龙虎榜数据接口',
    enabled: true
  });
};

// 同步某日龙虎榜；dateStr 缺省为北京当日（非交易日东财返回空，等价清不了旧数据，安全）
export const syncLhb = async (dateStr?: string): Promise<{ date: string; stocks: number; seats: number }> => {
  const date = dateStr ?? getBeijingDateStr();
  let sources = await listEnabledLhbSources();
  if (sources.length === 0) {
    await ensureDefaultSource();
    sources = await listEnabledLhbSources();
  }

  let stocks = 0;
  let seats = 0;
  for (const source of sources) {
    try {
      // 目前仅支持东财 datacenter 格式（type=api）
      const day = await fetchLhbDay(date);
      // 空榜保护：非交易日/接口异常返回空时跳过写入
      //（replaceLhbDay 为先删后插，空写会误清该日已有数据）
      if (day.stocks.length === 0) {
        console.log(`[sync-lhb] ${date} 无上榜数据（非交易日或接口空响应），跳过写入`);
        await markLhbSourceSync(source.id, 'success', 0);
        continue;
      }
      const written = await replaceLhbDay(date, day.stocks, day.seats);
      await markLhbSourceSync(source.id, 'success', written.stocks);
      stocks = written.stocks;
      seats = written.seats;
      console.log(`[sync-lhb] ${date} 数据源「${source.name}」同步完成：个股 ${written.stocks} 条，席位 ${written.seats} 条`);
    } catch (error) {
      console.error(`[sync-lhb] ${date} 数据源「${source.name}」同步失败:`, error);
      await markLhbSourceSync(source.id, 'failed').catch(() => {});
    }
  }
  return { date, stocks, seats };
};

export interface LhbRangeDayResult {
  date: string;
  stocks?: number;
  seats?: number;
  skipped?: boolean; // 空榜日（非交易日），未写入
  error?: string;
}

// 按日期区间回补龙虎榜：逐工作日调用单日同步，日间 sleep 1s 防限流；
// 单日失败记录后继续，不中断整个区间（依赖 syncLhb 的空榜保护，空榜日记 skipped）
export const syncLhbRange = async (
  from: string,
  to: string
): Promise<{ from: string; to: string; total: number; synced: number; detail: LhbRangeDayResult[] }> => {
  const days = tradingDaysBetween(from, to);
  const detail: LhbRangeDayResult[] = [];
  for (const date of days) {
    try {
      const r = await syncLhb(date);
      detail.push(r.stocks === 0 ? { date, skipped: true } : { date, stocks: r.stocks, seats: r.seats });
    } catch (error) {
      detail.push({ date, error: (error as Error)?.message ?? String(error) });
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return {
    from,
    to,
    total: days.length,
    synced: detail.filter(d => !d.error && !d.skipped).length,
    detail
  };
};
