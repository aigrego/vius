import prisma from '@/lib/prisma';

export type TStockBasic = {
  code: string;
  name: string;
  market: string; // sh/sz/bj
};

const BATCH_SIZE = 500;

// 批量写入股票基础信息。
// 注意：TiDB Cloud 跨洋访问 RTT 高（~150ms），逐条 upsert 极慢（5000 条 ≈ 十几分钟）。
// 改为：一次查出已有记录 → 新股 createMany（每批 500 一个请求）→ 仅对名称/市场变化或复牌的少量股票单独 update
export const upsertStockBasics = async (list: TStockBasic[]): Promise<number> => {
  const existing = await prisma.stockBasic.findMany({
    select: { code: true, name: true, market: true, isActive: true }
  });
  const existingMap = new Map(existing.map(e => [e.code, e]));

  const toCreate: TStockBasic[] = [];
  const toUpdate: TStockBasic[] = [];
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
    await prisma.stockBasic.createMany({
      // createMany 不会自动写 @updatedAt，显式带上
      data: toCreate.slice(start, start + BATCH_SIZE).map(s => ({ ...s, updatedAt: now })),
      skipDuplicates: true
    });
  }
  for (let start = 0; start < toUpdate.length; start += BATCH_SIZE) {
    const batch = toUpdate.slice(start, start + BATCH_SIZE);
    await prisma.$transaction(
      batch.map(item =>
        prisma.stockBasic.update({
          where: { code: item.code },
          data: { name: item.name, market: item.market, isActive: true }
        })
      )
    );
  }
  return list.length;
};

// 获取全部在市的股票基础信息
export const getActiveStockBasics = async (): Promise<TStockBasic[]> => {
  return prisma.stockBasic.findMany({
    where: { isActive: true },
    select: { code: true, name: true, market: true }
  });
};

// code → { name, market } 映射，供快讯匹配等场景使用
export const getStockBasicMap = async (): Promise<Map<string, { name: string; market: string }>> => {
  const list = await getActiveStockBasics();
  const map = new Map<string, { name: string; market: string }>();
  for (const item of list) {
    map.set(item.code, { name: item.name, market: item.market });
  }
  return map;
};

// 不在最新清单里的股票置为退市/停牌（is_active=false）
export const markInactiveExcept = async (codes: string[]): Promise<number> => {
  const result = await prisma.stockBasic.updateMany({
    where: { code: { notIn: codes }, isActive: true },
    data: { isActive: false }
  });
  return result.count;
};
