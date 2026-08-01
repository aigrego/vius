import prisma from '@/lib/prisma';

// 板块条目（code = 源前缀:原始id，如 xgb:886001、qq:pt0124）
export type TPlateItem = {
  code: string;
  name: string;
  kind: string; // industry / concept
  source: string; // xgb / qq
};

// 批量 upsert 板块（数量少，逐条 upsert 即可）
export const upsertPlates = async (list: TPlateItem[]): Promise<number> => {
  for (const item of list) {
    await prisma.plate.upsert({
      where: { code: item.code },
      create: item,
      update: { name: item.name, kind: item.kind }
    });
  }
  return list.length;
};

// 整体替换某板块的成分股（deleteMany + createMany，两步完成等价 upsert）
export const replacePlateStocks = async (plateCode: string, stockCodes: string[]): Promise<number> => {
  await prisma.plateStock.deleteMany({ where: { plateCode } });
  if (stockCodes.length === 0) return 0;
  const result = await prisma.plateStock.createMany({
    data: stockCodes.map(stockCode => ({ plateCode, stockCode })),
    skipDuplicates: true
  });
  return result.count;
};

// 查询板块成分股（关联字典 + 可选当日交易行由调用方补），按 stockCode 排序
export const getPlateStocks = async (plateCode: string) => {
  return prisma.plateStock.findMany({
    where: { plateCode },
    include: { stock: { select: { code: true, name: true, market: true, type: true } } },
    orderBy: { stockCode: 'asc' }
  });
};

// 按 code 查板块
export const getPlate = async (code: string) => {
  return prisma.plate.findUnique({ where: { code } });
};
