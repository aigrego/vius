import prisma from '@/lib/prisma';

export type TStockSignalInput = {
  code: string;
  date: string; // YYYY-MM-DD
  type: string; // bottom_volume / top_volume
  detail?: string | null; // JSON 字符串：量比、位置分位等
};

const BATCH_SIZE = 500;

const toUtcDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

// 批量写入信号（code+date+type 唯一约束，createMany skipDuplicates 幂等；
// 每日信号量少，重复跑只需覆盖 detail 的场景极少，跳过更新换取批量写性能）
export const upsertStockSignals = async (signals: TStockSignalInput[]): Promise<number> => {
  if (signals.length === 0) return 0;
  for (let start = 0; start < signals.length; start += BATCH_SIZE) {
    const batch = signals.slice(start, start + BATCH_SIZE);
    await prisma.stockSignal.createMany({
      data: batch.map(signal => ({
        code: signal.code,
        date: toUtcDate(signal.date),
        type: signal.type,
        detail: signal.detail ?? null
      })),
      skipDuplicates: true
    });
  }
  return signals.length;
};

// 查询信号（联 StockBasic 带上股票名称），按日期倒序
export const getStockSignals = async (options: {
  type?: string;
  date?: string;
  limit?: number;
} = {}) => {
  const { type, date, limit = 100 } = options;
  const signals = await prisma.stockSignal.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(date ? { date: toUtcDate(date) } : {})
    },
    orderBy: { date: 'desc' },
    take: limit
  });
  if (signals.length === 0) return [];

  // StockSignal 与 StockBasic 未建外键关系，手动联表补名称
  const codes = [...new Set(signals.map(s => s.code))];
  const basics = await prisma.stockBasic.findMany({
    where: { code: { in: codes } },
    select: { code: true, name: true, market: true }
  });
  const basicMap = new Map(basics.map(b => [b.code, b]));

  return signals.map(signal => ({
    ...signal,
    name: basicMap.get(signal.code)?.name ?? null,
    market: basicMap.get(signal.code)?.market ?? null
  }));
};
