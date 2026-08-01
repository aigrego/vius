import prisma from '@/lib/prisma';
import type { StockTrade as StockTradeRow } from '@prisma/client';

// 交易/日线输入结构（volume 单位为手；date 为 YYYY-MM-DD，缺省时由 upsert 的 date 参数统一指定）
// 历史 K 线回补时 close 映射到 current；prevOpen/prevClose/amplitude 可空，写入方尽量带
export type TStockTradeInput = {
  stockCode: string; // fullCode
  date?: string;
  open?: number | null;
  current?: number | null; // 现价/收盘价
  prevOpen?: number | null;
  prevClose?: number | null;
  high?: number | null;
  low?: number | null;
  changePct?: number | null;
  amplitude?: number | null;
  volume?: number | null;
  amount?: number | null;
  turnover?: number | null;
};

const BATCH_SIZE = 500;

// YYYY-MM-DD 转成 UTC 零点的 Date（对应 @db.Date 列）
export const toUtcDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

// 北京时间的今日日期串（盘中快照以交易日归属）
export const todayStr = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });

const amplitudeOf = (high: number | null, low: number | null, prevClose: number | null): number | null =>
  high != null && low != null && prevClose != null && prevClose > 0
    ? ((high - low) / prevClose) * 100
    : null;

// 批量写入交易记录。
// 注意：TiDB Cloud 跨洋访问 RTT 高（~150ms），逐条 upsert 极慢（5000 条 ≈ 十几分钟）。
// 改为 createMany（每批 500 一个请求）：
// - 快照场景（带 date 参数）：先 deleteMany 清掉当日旧数据再整批插入，等价于 upsert 且支持收盘后数据修正
// - 回补场景（bar 自带 date）：createMany skipDuplicates，靠 stockCode+date 唯一约束幂等
export const upsertStockTrades = async (bars: TStockTradeInput[], date?: string): Promise<number> => {
  if (bars.length === 0) return 0;

  const mapRow = (bar: TStockTradeInput, target: Date) => ({
    stockCode: bar.stockCode,
    date: target,
    open: bar.open ?? null,
    current: bar.current ?? null,
    prevOpen: bar.prevOpen ?? null,
    prevClose: bar.prevClose ?? null,
    high: bar.high ?? null,
    low: bar.low ?? null,
    changePct: bar.changePct ?? null,
    amplitude: bar.amplitude ?? amplitudeOf(bar.high ?? null, bar.low ?? null, bar.prevClose ?? null),
    volume: bar.volume ?? null,
    amount: bar.amount ?? null,
    turnover: bar.turnover ?? null,
    // createMany 不会自动写 @updatedAt，显式带上
    updatedAt: new Date()
  });

  if (date) {
    const target = toUtcDate(date);
    await prisma.stockTrade.deleteMany({ where: { date: target } });
    for (let start = 0; start < bars.length; start += BATCH_SIZE) {
      await prisma.stockTrade.createMany({
        data: bars.slice(start, start + BATCH_SIZE).map(bar => mapRow(bar, target)),
        skipDuplicates: true
      });
    }
    return bars.length;
  }

  let count = 0;
  for (let start = 0; start < bars.length; start += BATCH_SIZE) {
    const batch = bars.slice(start, start + BATCH_SIZE);
    await prisma.stockTrade.createMany({
      data: batch.map(bar => mapRow(bar, toUtcDate(bar.date!))),
      skipDuplicates: true
    });
    count += batch.length;
  }
  return count;
};

// 盘中快照写入（sync-snapshot 用）：整体替换指定股票当日行。
// prevClose 由行情源快照自带；prevOpen 先保留当日已有值，否则取前一交易日开盘价
export const replaceSnapshots = async (
  rows: {
    stockCode: string;
    open?: number | null;
    current?: number | null;
    prevClose?: number | null;
    high?: number | null;
    low?: number | null;
    changePct?: number | null;
    volume?: number | null;
    amount?: number | null;
    turnover?: number | null;
  }[],
  date: string = todayStr()
): Promise<number> => {
  if (rows.length === 0) return 0;
  const target = toUtcDate(date);
  const codes = rows.map(r => r.stockCode);

  // 当日已有行：保留 prevOpen
  const existing = await prisma.stockTrade.findMany({
    where: { date: target, stockCode: { in: codes } },
    select: { stockCode: true, prevOpen: true }
  });
  const prevOpenMap = new Map(existing.map(e => [e.stockCode, e.prevOpen]));

  // 缺 prevOpen 的，取最近一个 < 当日的交易日行
  const missing = codes.filter(c => !prevOpenMap.has(c) || prevOpenMap.get(c) == null);
  if (missing.length > 0) {
    const prevDateRow = await prisma.stockTrade.findFirst({
      where: { date: { lt: target } },
      orderBy: { date: 'desc' },
      select: { date: true }
    });
    if (prevDateRow) {
      const prevRows = await prisma.stockTrade.findMany({
        where: { date: prevDateRow.date, stockCode: { in: missing } },
        select: { stockCode: true, open: true }
      });
      for (const r of prevRows) prevOpenMap.set(r.stockCode, r.open);
    }
  }

  await prisma.stockTrade.deleteMany({ where: { date: target, stockCode: { in: codes } } });
  const now = new Date();
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    await prisma.stockTrade.createMany({
      data: rows.slice(start, start + BATCH_SIZE).map(r => {
        const prevClose = r.prevClose ?? null;
        return {
          stockCode: r.stockCode,
          date: target,
          open: r.open ?? null,
          current: r.current ?? null,
          prevOpen: prevOpenMap.get(r.stockCode) ?? null,
          prevClose,
          high: r.high ?? null,
          low: r.low ?? null,
          changePct: r.changePct ?? null,
          amplitude: amplitudeOf(r.high ?? null, r.low ?? null, prevClose),
          volume: r.volume ?? null,
          amount: r.amount ?? null,
          turnover: r.turnover ?? null,
          updatedAt: now
        };
      }),
      skipDuplicates: true
    });
  }
  return rows.length;
};

// 获取指定股票某日期的交易行（实时接口读当日快照用），返回 fullCode → 行
export const getTradesByDate = async (stockCodes: string[], date: string = todayStr()) => {
  if (stockCodes.length === 0) return new Map<string, StockTradeRow>();
  const rows = await prisma.stockTrade.findMany({
    where: { date: toUtcDate(date), stockCode: { in: stockCodes } }
  });
  return new Map(rows.map(r => [r.stockCode, r]));
};

// 获取单股最近 limit 根交易行（按日期倒序）
export const getStockTrades = async (stockCode: string, limit: number = 250) => {
  return prisma.stockTrade.findMany({
    where: { stockCode },
    orderBy: { date: 'desc' },
    take: limit
  });
};

// 获取库中最新的交易日期
export const getLatestTradeDate = async (): Promise<Date | null> => {
  const row = await prisma.stockTrade.findFirst({
    orderBy: { date: 'desc' },
    select: { date: true }
  });
  return row?.date ?? null;
};

// 获取当日缺少交易行的在市股票代码（新上市/新入库的需要历史回补）
export const getCodesMissingTrade = async (date: string): Promise<string[]> => {
  const target = toUtcDate(date);
  const [actives, trades] = await Promise.all([
    prisma.stockDict.findMany({ where: { isActive: true, type: 'stock' }, select: { code: true } }),
    prisma.stockTrade.findMany({ where: { date: target }, select: { stockCode: true } })
  ]);
  const hasTrade = new Set(trades.map(t => t.stockCode));
  return actives.map(a => a.code).filter(code => !hasTrade.has(code));
};

// 获取历史交易行不足 minBars 根的在市股票代码（首次启用时全量回补历史用）
export const getCodesWithInsufficientHistory = async (minBars: number): Promise<string[]> => {
  const [actives, counts] = await Promise.all([
    prisma.stockDict.findMany({ where: { isActive: true, type: 'stock' }, select: { code: true } }),
    prisma.stockTrade.groupBy({ by: ['stockCode'], _count: { stockCode: true } })
  ]);
  const countMap = new Map(counts.map(c => [c.stockCode, c._count.stockCode]));
  return actives.map(a => a.code).filter(code => (countMap.get(code) ?? 0) < minBars);
};

// 获取区间 [from, to] 内交易行有缺漏的活跃股票代码（区间回补用）。
// 以区间内单股最大条数近似区间交易日数（大多数股票全勤），少于它的即为缺漏；
// 停牌股会被误判为缺漏，但回补拉不到停牌日 bar、upsert 幂等，无害
export const getCodesMissingInRange = async (from: string, to: string): Promise<string[]> => {
  const [actives, counts] = await Promise.all([
    prisma.stockDict.findMany({ where: { isActive: true, type: 'stock' }, select: { code: true } }),
    prisma.stockTrade.groupBy({
      by: ['stockCode'],
      where: { date: { gte: toUtcDate(from), lte: toUtcDate(to) } },
      _count: { stockCode: true }
    })
  ]);
  const maxCount = Math.max(0, ...counts.map(c => c._count.stockCode));
  // 区间整体无数据：全量活跃股都需回补
  if (maxCount === 0) return actives.map(a => a.code);
  const countMap = new Map(counts.map(c => [c.stockCode, c._count.stockCode]));
  return actives.map(a => a.code).filter(code => (countMap.get(code) ?? 0) < maxCount);
};

// 近 N 日平均成交量（单位为手），用于告警的量比计算
export const getAvgVolume = async (stockCode: string, days: number = 5): Promise<number | null> => {
  const rows = await prisma.stockTrade.findMany({
    where: { stockCode, volume: { not: null } },
    orderBy: { date: 'desc' },
    take: days,
    select: { volume: true }
  });
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, r) => acc + (r.volume ?? 0), 0);
  return sum / rows.length;
};
