// 龙虎榜同步任务：从启用的数据源（东方财富 datacenter）拉取某日个股榜单+席位明细落库
// 由 scheduler 的 sync-lhb 任务（工作日 17:30）或手动 POST /api/ashare/sync?type=lhb 触发

import { fetchLhbDay } from '@/lib/lhb';
import { replaceLhbDay } from '@/model/Lhb';
import { listEnabledLhbSources, createLhbSource, markLhbSourceSync } from '@/model/LhbSource';

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
