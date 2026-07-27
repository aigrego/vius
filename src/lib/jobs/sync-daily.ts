// 每日 A 股行情同步任务：股票清单 → 当日快照 → 缺失股票历史回补
// 幂等：全靠 code+date / code 唯一约束 upsert，重复执行不会产生重复数据

import {
  fetchAStockList,
  fetchDailySnapshot,
  fetchHistoryKline,
  runWithConcurrency
} from '@/lib/eastmoney';
import { upsertStockBasics, markInactiveExcept, getStockBasicMap } from '@/model/StockBasic';
import { upsertStockDailies, getCodesMissingDaily, getCodesWithInsufficientHistory } from '@/model/StockDaily';

// 取北京时间的 YYYY-MM-DD（A股交易日以北京时间为准，与服务器时区解耦）
export const getBeijingDateStr = (d: Date = new Date()): string =>
  d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });

// DB 瞬时断连重试（TiDB Cloud 跨洋链路偶发 P1001，重试 3 次、间隔 3s）
const withDbRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`[sync-daily] DB 操作失败，第 ${attempt + 1} 次重试...`, (error as Error)?.message?.slice(0, 120));
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  throw lastError;
};

export const syncDailyStocks = async (options: {
  // 只回补指定代码的历史K线（跳过清单与快照同步），用于新股/补缺/本地验证
  onlyBackfillCodes?: string[];
} = {}): Promise<{
  stocks: number;
  dailies: number;
  backfilled: number;
}> => {
  const date = getBeijingDateStr();
  let stocksCount = 0;
  let dailiesCount = 0;

  if (!options.onlyBackfillCodes) {
    // 1. 同步股票清单
    console.log('[sync-daily] 开始同步股票清单...');
    const list = await fetchAStockList();
    await withDbRetry(() => upsertStockBasics(list));
    const inactivated = await withDbRetry(() => markInactiveExcept(list.map(s => s.code)));
    console.log(`[sync-daily] 股票清单同步完成：${list.length} 只，退市标记 ${inactivated} 只`);
    stocksCount = list.length;

    // 2. 同步当日快照（date 取快照当天，Date 对象按 UTC 零点存储）
    console.log(`[sync-daily] 开始同步 ${date} 当日快照...`);
    const snapshot = await fetchDailySnapshot();
    dailiesCount = await withDbRetry(() => upsertStockDailies(snapshot, date));
    console.log(`[sync-daily] 当日快照同步完成：${dailiesCount} 条`);
  }

  // 3. 回补历史K线：当日缺日线的（新上市/停牌）+ 历史不足 250 根的（首次启用时全量回补，
  //    后续每日运行时集合为空，只回补新股）；onlyBackfillCodes 模式下只回补指定代码
  let backfillCodes: string[];
  if (options.onlyBackfillCodes) {
    backfillCodes = options.onlyBackfillCodes;
    console.log(`[sync-daily] 指定回补 ${backfillCodes.length} 只股票`);
  } else {
    const [missingCodes, insufficientCodes] = await withDbRetry(() => Promise.all([
      getCodesMissingDaily(date),
      getCodesWithInsufficientHistory(250)
    ]));
    backfillCodes = [...new Set([...missingCodes, ...insufficientCodes])];
    console.log(`[sync-daily] 需要历史回补的股票：${backfillCodes.length} 只（缺当日 ${missingCodes.length}，历史不足 ${insufficientCodes.length}）`);
  }
  let backfilled = 0;
  if (backfillCodes.length > 0) {
    const basicMap = await withDbRetry(() => getStockBasicMap());
    // 并发 2 + 批间 800ms：东财对高频请求会临时封 IP（全源 TCP 重置，约数十分钟解封），
    // 封禁期间请求越快封得越久。单股失败已 catch，不足 250 根的股票靠后续每日同步自愈
    await runWithConcurrency(backfillCodes, 2, async code => {
      try {
        const market = basicMap.get(code)?.market ?? 'sh';
        const bars = await fetchHistoryKline(code, market, 250);
        if (bars.length === 0) return;
        await upsertStockDailies(bars);
        backfilled += 1;
      } catch (error) {
        // 单股失败不影响整体
        console.error(`[sync-daily] ${code} 历史回补失败:`, error);
      }
    }, 800);
    console.log(`[sync-daily] 历史回补完成：${backfilled}/${backfillCodes.length} 只`);
  }

  return { stocks: stocksCount, dailies: dailiesCount, backfilled };
};
