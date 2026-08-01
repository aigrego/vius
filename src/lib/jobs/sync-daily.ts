// 每日 A 股行情同步任务：股票字典 → 当日快照 → 缺失股票历史回补
// 幂等：全靠 stockCode+date / code 唯一约束 upsert，重复执行不会产生重复数据

import {
  fetchAStockList,
  fetchDailySnapshot,
  fetchHistoryKline,
  runWithConcurrency,
  type DailyBar
} from '@/lib/eastmoney';
import { toFullCode, parseFullCode, isAShareFullCode } from '@/lib/stock-code';
import { upsertStockDicts, markInactiveDictsExcept, getStockDictMap } from '@/model/StockDict';
import {
  upsertStockTrades,
  getCodesMissingTrade,
  getCodesWithInsufficientHistory,
  getCodesMissingInRange,
  type TStockTradeInput
} from '@/model/StockTrade';

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

// 回补代码入参归一化：已是 fullCode 的原样保留，裸 6 位按 A 股前缀规则推断市场
const toBackfillFullCode = (code: string): string =>
  isAShareFullCode(code) ? code : toFullCode(code);

// 东财快照 bar（裸代码）→ stock_trade 输入（fullCode；close→current，带上昨收）
const snapshotToTrade = (bar: DailyBar): TStockTradeInput => ({
  stockCode: toFullCode(bar.code),
  open: bar.open,
  current: bar.close,
  prevClose: bar.prevClose ?? null,
  high: bar.high,
  low: bar.low,
  changePct: bar.changePct,
  volume: bar.volume,
  amount: bar.amount,
  turnover: bar.turnover
});

// 历史 K 线 bars（按日期升序）→ stock_trade 输入：close→current，
// prevClose 取前一根 bar 的收盘价（第一根为 null）
const klineToTrades = (bars: (DailyBar & { date: string })[], fullCode: string): TStockTradeInput[] =>
  bars.map((bar, i) => ({
    stockCode: fullCode,
    date: bar.date,
    open: bar.open,
    current: bar.close,
    prevClose: i > 0 ? bars[i - 1]!.close : null,
    high: bar.high,
    low: bar.low,
    changePct: bar.changePct,
    volume: bar.volume,
    amount: bar.amount,
    turnover: bar.turnover
  }));

export const syncDailyStocks = async (options: {
  // 只回补指定代码的历史K线（跳过清单与快照同步），用于新股/补缺/本地验证；接受裸代码或 fullCode
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
    // 1. 同步股票字典
    console.log('[sync-daily] 开始同步股票清单...');
    const list = await fetchAStockList();
    const dicts = list.map(s => ({ code: toFullCode(s.code, s.market), name: s.name, market: s.market.toUpperCase() }));
    await withDbRetry(() => upsertStockDicts(dicts));
    const inactivated = await withDbRetry(() => markInactiveDictsExcept(dicts.map(s => s.code)));
    console.log(`[sync-daily] 股票清单同步完成：${list.length} 只，退市标记 ${inactivated} 只`);
    stocksCount = list.length;

    // 2. 同步当日快照（date 取快照当天，Date 对象按 UTC 零点存储）
    console.log(`[sync-daily] 开始同步 ${date} 当日快照...`);
    const snapshot = await fetchDailySnapshot();
    dailiesCount = await withDbRetry(() => upsertStockTrades(snapshot.map(snapshotToTrade), date));
    console.log(`[sync-daily] 当日快照同步完成：${dailiesCount} 条`);
  }

  // 3. 回补历史K线：当日缺交易行的（新上市/停牌）+ 历史不足 250 根的（首次启用时全量回补，
  //    后续每日运行时集合为空，只回补新股）；onlyBackfillCodes 模式下只回补指定代码
  let backfillCodes: string[];
  if (options.onlyBackfillCodes) {
    backfillCodes = options.onlyBackfillCodes.map(toBackfillFullCode);
    console.log(`[sync-daily] 指定回补 ${backfillCodes.length} 只股票`);
  } else {
    const [missingCodes, insufficientCodes] = await withDbRetry(() => Promise.all([
      getCodesMissingTrade(date),
      getCodesWithInsufficientHistory(250)
    ]));
    backfillCodes = [...new Set([...missingCodes, ...insufficientCodes])];
    console.log(`[sync-daily] 需要历史回补的股票：${backfillCodes.length} 只（缺当日 ${missingCodes.length}，历史不足 ${insufficientCodes.length}）`);
  }
  let backfilled = 0;
  if (backfillCodes.length > 0) {
    const dictMap = await withDbRetry(() => getStockDictMap());
    // 并发 2 + 批间 800ms：东财对高频请求会临时封 IP（全源 TCP 重置，约数十分钟解封），
    // 封禁期间请求越快封得越久。单股失败已 catch，不足 250 根的股票靠后续每日同步自愈
    await runWithConcurrency(backfillCodes, 2, async fullCode => {
      try {
        const market = (dictMap.get(fullCode)?.market ?? 'SH').toLowerCase();
        const { code } = parseFullCode(fullCode);
        const bars = await fetchHistoryKline(code, market, 250);
        if (bars.length === 0) return;
        await upsertStockTrades(klineToTrades(bars, fullCode));
        backfilled += 1;
      } catch (error) {
        // 单股失败不影响整体
        console.error(`[sync-daily] ${fullCode} 历史回补失败:`, error);
      }
    }, 800);
    console.log(`[sync-daily] 历史回补完成：${backfilled}/${backfillCodes.length} 只`);
  }

  return { stocks: stocksCount, dailies: dailiesCount, backfilled };
};

// 按日期区间回补日行情：只补「区间内有缺漏」的活跃股（缺漏判定见 getCodesMissingInRange），
// 不动清单与当日快照；与每日任务同款并发护栏（并发 2 + 批间 800ms）防东财封 IP，
// 每股拉 250 根历史靠 stockCode+date 唯一约束幂等落库（skipDuplicates）
export const backfillDailyRange = async (
  from: string,
  to: string
): Promise<{ from: string; to: string; missing: number; backfilled: number }> => {
  const backfillCodes = await withDbRetry(() => getCodesMissingInRange(from, to));
  console.log(`[sync-daily] 区间 ${from}~${to} 日线缺漏股票：${backfillCodes.length} 只`);
  if (backfillCodes.length === 0) return { from, to, missing: 0, backfilled: 0 };

  const dictMap = await withDbRetry(() => getStockDictMap());
  let backfilled = 0;
  await runWithConcurrency(backfillCodes, 2, async fullCode => {
    try {
      const market = (dictMap.get(fullCode)?.market ?? 'SH').toLowerCase();
      const { code } = parseFullCode(fullCode);
      const bars = await fetchHistoryKline(code, market, 250);
      if (bars.length === 0) return;
      await upsertStockTrades(klineToTrades(bars, fullCode));
      backfilled += 1;
    } catch (error) {
      // 单股失败不影响整体
      console.error(`[sync-daily] ${fullCode} 区间回补失败:`, error);
    }
  }, 800);
  console.log(`[sync-daily] 区间回补完成：${backfilled}/${backfillCodes.length} 只`);
  return { from, to, missing: backfillCodes.length, backfilled };
};
