// 盘中快照任务：交易时段（北京时间 9:30-15:00）每 10 秒由 scheduler 触发
// 只刷新关注股集合（股票池 ∪ 持仓中 ∪ 指数）的当日行，行情走实时多源（新浪/腾讯/东财）
// 全市场日线由 sync-daily 每日 16:00 同步；其他股票的当日价走 trade-penetration 穿透式回源
// 收盘后的正式日线由 sync-daily 覆盖，本任务只负责盘中「当日行」的刷新

import prisma from '@/lib/prisma';
import { fetchRealtimeQuotes, type RealtimeQuote } from '@/lib/realtime';
import { parseFullCode } from '@/lib/stock-code';
import { getIndexDicts } from '@/model/StockDict';
import { replaceSnapshots } from '@/model/StockTrade';

// 北京时区当前分钟数（0-1439）
const getBeijingMinutes = (): number => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return now.getHours() * 60 + now.getMinutes();
};

// 实时行情 → replaceSnapshots 输入行。
// realtime 的 close 字段语义是昨收 → prevClose；成交量单位不统一（sina=股，其他=手），sina 源 ÷100
const quoteToRow = (quote: RealtimeQuote, fullCode: string) => ({
  stockCode: fullCode,
  open: quote.open,
  current: quote.current,
  prevClose: quote.close,
  high: quote.high,
  low: quote.low,
  changePct: quote.changePct,
  volume: quote.source === 'sina' ? quote.volume / 100 : quote.volume,
  amount: quote.amount
});

// 关注股集合：股票池全部 ∪ 持仓中 ∪ 指数字典
const getWatchedFullCodes = async (): Promise<string[]> => {
  const [watchRows, positionRows, indexDicts] = await Promise.all([
    prisma.watchlist.findMany({ select: { stockCode: true }, distinct: ['stockCode'] }),
    prisma.position.findMany({ where: { status: 'holding' }, select: { stockCode: true }, distinct: ['stockCode'] }),
    getIndexDicts()
  ]);
  const set = new Set<string>();
  for (const r of watchRows) set.add(r.stockCode);
  for (const r of positionRows) set.add(r.stockCode);
  for (const d of indexDicts) set.add(d.code);
  return [...set];
};

// 进程内防重入（每 10 秒调度，上一轮未跑完则跳过本轮）
let running = false;

export const syncSnapshot = async (): Promise<{ watched: number }> => {
  // 仅交易时段执行（9:30-15:00 北京时间）
  const minutes = getBeijingMinutes();
  if (minutes < 9 * 60 + 30 || minutes > 15 * 60) {
    return { watched: 0 };
  }
  if (running) {
    console.log('[sync-snapshot] 上一轮未结束，跳过本轮');
    return { watched: 0 };
  }
  running = true;
  try {
    // fullCode → 裸代码 + 小写市场 hints 调实时行情多源
    const fullCodes = await getWatchedFullCodes();
    if (fullCodes.length === 0) return { watched: 0 };
    const parsed = fullCodes.map(fc => parseFullCode(fc));
    const quotes = await fetchRealtimeQuotes(
      parsed.map(p => p.code),
      parsed.map(p => p.market.toLowerCase())
    );
    // 行情返回的是大写裸代码，按裸代码反查 fullCode（A股各市场号段不重叠，不会撞码）
    const fullCodeByBare = new Map(parsed.map((p, i) => [p.code.toUpperCase(), fullCodes[i]!]));
    const rows = quotes.flatMap(q => {
      const fullCode = fullCodeByBare.get(q.code.toUpperCase());
      return fullCode ? [quoteToRow(q, fullCode)] : [];
    });
    const watched = await replaceSnapshots(rows);
    return { watched };
  } finally {
    running = false;
  }
};
