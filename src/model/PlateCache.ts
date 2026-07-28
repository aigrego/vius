import prisma from '@/lib/prisma';

// 板块缓存 kind：qq_hy=腾讯行业板块 / qq_gn=腾讯题材板块 / xgb_rise=选股宝涨幅榜 / xgb_fall=选股宝跌幅榜
export type PlateKind = 'qq_hy' | 'qq_gn' | 'xgb_rise' | 'xgb_fall';

// 读取某类板块缓存（不存在返回 null）
export const getPlateCache = async (kind: PlateKind): Promise<{ payload: string; updatedAt: Date } | null> => {
  const row = await prisma.plateCache.findUnique({ where: { kind } });
  return row ? { payload: row.payload, updatedAt: row.updatedAt } : null;
};

// 写入/更新某类板块缓存
export const upsertPlateCache = async (kind: PlateKind, payload: string): Promise<void> => {
  await prisma.plateCache.upsert({
    where: { kind },
    create: { kind, payload },
    update: { payload }
  });
};
