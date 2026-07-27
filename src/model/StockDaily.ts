import prisma from '@/lib/prisma';

// 日线输入结构（volume 单位为手；date 为 YYYY-MM-DD，缺省时由 upsert 的 date 参数统一指定）
export type TStockDailyInput = {
  code: string;
  date?: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  changePct: number;
  turnover?: number | null;
};

const BATCH_SIZE = 500;

// YYYY-MM-DD 转成 UTC 零点的 Date（对应 @db.Date 列）
const toUtcDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

// 批量写入日线。
// 注意：TiDB Cloud 跨洋访问 RTT 高（~150ms），逐条 upsert 极慢（5000 条 ≈ 十几分钟）。
// 改为 createMany（每批 500 一个请求）：
// - 快照场景（带 date 参数）：先 deleteMany 清掉当日旧数据再整批插入，等价于 upsert 且支持收盘后数据修正
// - 回补场景（bar 自带 date）：createMany skipDuplicates，靠 code+date 唯一约束幂等
export const upsertStockDailies = async (bars: TStockDailyInput[], date?: string): Promise<number> => {
  if (bars.length === 0) return 0;

  if (date) {
    const target = toUtcDate(date);
    await prisma.stockDaily.deleteMany({ where: { date: target } });
    for (let start = 0; start < bars.length; start += BATCH_SIZE) {
      await prisma.stockDaily.createMany({
        data: bars.slice(start, start + BATCH_SIZE).map(bar => ({
          code: bar.code,
          date: target,
          open: bar.open,
          close: bar.close,
          high: bar.high,
          low: bar.low,
          volume: bar.volume,
          amount: bar.amount,
          changePct: bar.changePct,
          turnover: bar.turnover ?? null
        })),
        skipDuplicates: true
      });
    }
    return bars.length;
  }

  let count = 0;
  for (let start = 0; start < bars.length; start += BATCH_SIZE) {
    const batch = bars.slice(start, start + BATCH_SIZE);
    await prisma.stockDaily.createMany({
      data: batch.map(bar => ({
        code: bar.code,
        date: toUtcDate(bar.date!),
        open: bar.open,
        close: bar.close,
        high: bar.high,
        low: bar.low,
        volume: bar.volume,
        amount: bar.amount,
        changePct: bar.changePct,
        turnover: bar.turnover ?? null
      })),
      skipDuplicates: true
    });
    count += batch.length;
  }
  return count;
};

// 获取单股最近 limit 根日线（按日期倒序）
export const getStockDailies = async (code: string, limit: number = 250) => {
  return prisma.stockDaily.findMany({
    where: { code },
    orderBy: { date: 'desc' },
    take: limit
  });
};

// 获取库中最新的日线日期
export const getLatestDailyDate = async (): Promise<Date | null> => {
  const row = await prisma.stockDaily.findFirst({
    orderBy: { date: 'desc' },
    select: { date: true }
  });
  return row?.date ?? null;
};

// 获取当日缺少日线的在市股票代码（新上市/新入库的需要历史回补）
export const getCodesMissingDaily = async (date: string): Promise<string[]> => {
  const target = toUtcDate(date);
  const [actives, dailies] = await Promise.all([
    prisma.stockBasic.findMany({ where: { isActive: true }, select: { code: true } }),
    prisma.stockDaily.findMany({ where: { date: target }, select: { code: true } })
  ]);
  const hasDaily = new Set(dailies.map(d => d.code));
  return actives.map(a => a.code).filter(code => !hasDaily.has(code));
};

// 获取历史日线不足 minBars 根的在市股票代码（首次启用时全量回补历史用）
export const getCodesWithInsufficientHistory = async (minBars: number): Promise<string[]> => {
  const [actives, counts] = await Promise.all([
    prisma.stockBasic.findMany({ where: { isActive: true }, select: { code: true } }),
    prisma.stockDaily.groupBy({ by: ['code'], _count: { code: true } })
  ]);
  const countMap = new Map(counts.map(c => [c.code, c._count.code]));
  return actives.map(a => a.code).filter(code => (countMap.get(code) ?? 0) < minBars);
};

// 近 N 日平均成交量（单位为手），用于告警的量比计算
export const getAvgVolume = async (code: string, days: number = 5): Promise<number | null> => {
  const rows = await prisma.stockDaily.findMany({
    where: { code },
    orderBy: { date: 'desc' },
    take: days,
    select: { volume: true }
  });
  if (rows.length === 0) return null;
  const sum = rows.reduce((acc, r) => acc + r.volume, 0);
  return sum / rows.length;
};
