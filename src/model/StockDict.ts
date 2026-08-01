import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// 字典条目（code 为 fullCode，如 SH600519；market 为 SH/SZ/BJ/HK）
export type TStockDictItem = {
  code: string;
  name: string;
  market: string;
  type?: string; // stock / index / etf，缺省 stock
};

const BATCH_SIZE = 500;

// 批量写入股票字典。
// 注意：TiDB Cloud 跨洋访问 RTT 高（~150ms），逐条 upsert 极慢（5000 条 ≈ 十几分钟）。
// 改为：一次查出已有记录 → 新股 createMany（每批 500 一个请求）→ 仅对名称/市场变化或复牌的少量股票单独 update
export const upsertStockDicts = async (list: TStockDictItem[]): Promise<number> => {
  const existing = await prisma.stockDict.findMany({
    select: { code: true, name: true, market: true, isActive: true }
  });
  const existingMap = new Map(existing.map(e => [e.code, e]));

  const toCreate: TStockDictItem[] = [];
  const toUpdate: TStockDictItem[] = [];
  for (const item of list) {
    const old = existingMap.get(item.code);
    if (!old) {
      toCreate.push(item);
    } else if (old.name !== item.name || old.market !== item.market || !old.isActive) {
      toUpdate.push(item);
    }
  }

  for (let start = 0; start < toCreate.length; start += BATCH_SIZE) {
    const now = new Date();
    await prisma.stockDict.createMany({
      // createMany 不会自动写 @updatedAt，显式带上
      data: toCreate.slice(start, start + BATCH_SIZE).map(s => ({
        code: s.code,
        name: s.name,
        market: s.market,
        type: s.type ?? 'stock',
        updatedAt: now
      })),
      skipDuplicates: true
    });
  }
  for (let start = 0; start < toUpdate.length; start += BATCH_SIZE) {
    const batch = toUpdate.slice(start, start + BATCH_SIZE);
    await prisma.$transaction(
      batch.map(item =>
        prisma.stockDict.update({
          where: { code: item.code },
          data: { name: item.name, market: item.market, isActive: true }
        })
      )
    );
  }
  return list.length;
};

// 获取全部在市的字典条目（默认只要股票，指数/ETF 另算）
export const getActiveStockDicts = async (type: string = 'stock'): Promise<TStockDictItem[]> => {
  const rows = await prisma.stockDict.findMany({
    where: { isActive: true, type },
    select: { code: true, name: true, market: true, type: true }
  });
  return rows;
};

// fullCode → { name, market } 映射，供快讯匹配等场景使用（含全部在市股票）
export const getStockDictMap = async (): Promise<Map<string, { name: string; market: string }>> => {
  const list = await getActiveStockDicts();
  const map = new Map<string, { name: string; market: string }>();
  for (const item of list) {
    map.set(item.code, { name: item.name, market: item.market });
  }
  return map;
};

// 不在最新清单里的股票置为退市/停牌（is_active=false）
export const markInactiveDictsExcept = async (codes: string[], type: string = 'stock'): Promise<number> => {
  const result = await prisma.stockDict.updateMany({
    where: { code: { notIn: codes }, isActive: true, type },
    data: { isActive: false }
  });
  return result.count;
};

// 确保字典行存在（新建股票池/持仓、板块成分股懒建行用）；已存在直接返回
export const ensureStockDict = async (item: {
  code: string;
  name: string;
  market: string;
  type?: string;
}) => {
  const existing = await prisma.stockDict.findUnique({ where: { code: item.code } });
  if (existing) return existing;
  return prisma.stockDict.create({
    data: { code: item.code, name: item.name, market: item.market, type: item.type ?? 'stock' }
  });
};

// 指数清单（行情总览指数排用）
export const getIndexDicts = async (): Promise<TStockDictItem[]> => {
  return prisma.stockDict.findMany({
    where: { type: 'index', isActive: true },
    select: { code: true, name: true, market: true, type: true },
    orderBy: { code: 'asc' }
  });
};

// 基本面回填（sync-fundamentals 用）：按 fundamentalsAt 升序取最久未回填的在市股票（null 最前）
export const getStocksPendingFundamentals = async (limit: number = 300): Promise<TStockDictItem[]> => {
  return prisma.stockDict.findMany({
    where: { isActive: true, type: 'stock' },
    select: { code: true, name: true, market: true, type: true },
    orderBy: { fundamentalsAt: { sort: 'asc', nulls: 'first' } },
    take: limit
  });
};

// 写入单股基本面字段；抓不到全部字段也要调（fundamentalsAt 恒更新，避免卡在同一只）
export const updateStockFundamentals = async (
  code: string,
  data: {
    marketCap?: number | null;
    floatMarketCap?: number | null;
    mainBusiness?: Prisma.InputJsonValue;
    profitComposition?: Prisma.InputJsonValue;
    financials?: Prisma.InputJsonValue;
  }
): Promise<void> => {
  await prisma.stockDict.update({
    where: { code },
    data: {
      ...(data.marketCap !== undefined ? { marketCap: data.marketCap } : {}),
      ...(data.floatMarketCap !== undefined ? { floatMarketCap: data.floatMarketCap } : {}),
      ...(data.mainBusiness !== undefined ? { mainBusiness: data.mainBusiness } : {}),
      ...(data.profitComposition !== undefined ? { profitComposition: data.profitComposition } : {}),
      ...(data.financials !== undefined ? { financials: data.financials } : {}),
      fundamentalsAt: new Date()
    }
  });
};
