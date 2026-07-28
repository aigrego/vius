import prisma from '@/lib/prisma';

// 龙虎榜个股上榜记录输入结构（date 为 YYYY-MM-DD，由 replaceLhbDay 统一指定）
export type TLhbStockInput = {
  code: string;
  name: string;
  market: string; // sh / sz / bj
  closePrice: number;
  changePct: number;
  amount: number;
  reason: string;
  changeType: string;
  tradeId: string;
  buyAmt: number;
  sellAmt: number;
  netAmt: number;
};

// 龙虎榜席位明细输入结构
export type TLhbSeatInput = {
  code: string;
  tradeId: string;
  direction: string; // buy / sell
  rank: number;
  deptName: string;
  buy: number;
  sell: number;
  net: number;
};

const BATCH_SIZE = 500;

// YYYY-MM-DD 转成 UTC 零点的 Date（对应 @db.Date 列）
const toUtcDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

// 当日覆盖式写入龙虎榜：先清掉当日个股+席位旧数据再整批插入（同 stock_daily 快照约定）
export const replaceLhbDay = async (
  date: string,
  stocks: TLhbStockInput[],
  seats: TLhbSeatInput[]
): Promise<{ stocks: number; seats: number }> => {
  const target = toUtcDate(date);
  await prisma.$transaction([
    prisma.lhbStock.deleteMany({ where: { date: target } }),
    prisma.lhbSeat.deleteMany({ where: { date: target } })
  ]);
  for (let start = 0; start < stocks.length; start += BATCH_SIZE) {
    await prisma.lhbStock.createMany({
      data: stocks.slice(start, start + BATCH_SIZE).map(s => ({ ...s, date: target }))
    });
  }
  for (let start = 0; start < seats.length; start += BATCH_SIZE) {
    await prisma.lhbSeat.createMany({
      data: seats.slice(start, start + BATCH_SIZE).map(s => ({ ...s, date: target }))
    });
  }
  return { stocks: stocks.length, seats: seats.length };
};

// 获取库中最新的龙虎榜日期
export const getLatestLhbDate = async (): Promise<Date | null> => {
  const row = await prisma.lhbStock.findFirst({
    orderBy: { date: 'desc' },
    select: { date: true }
  });
  return row?.date ?? null;
};

// 已有数据的所有日期（倒序，供日期下拉/管理页展示）
export const listLhbDates = async (): Promise<Date[]> => {
  const rows = await prisma.lhbStock.findMany({
    distinct: ['date'],
    orderBy: { date: 'desc' },
    select: { date: true }
  });
  return rows.map(r => r.date);
};

// 某日龙虎榜个股列表（可选市场/关键字过滤），并返回各市场上榜数量（tab 徽章用）
export const listLhbStocks = async (params: {
  date: string;
  market?: string;
  keyword?: string;
}) => {
  const target = toUtcDate(params.date);
  const keyword = params.keyword?.trim();
  const where = {
    date: target,
    ...(params.market ? { market: params.market } : {}),
    ...(keyword ? { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] } : {})
  };
  const [list, grouped] = await Promise.all([
    prisma.lhbStock.findMany({ where, orderBy: [{ market: 'asc' }, { code: 'asc' }] }),
    prisma.lhbStock.groupBy({
      by: ['market'],
      where: { date: target },
      _count: { code: true }
    })
  ]);
  const counts: Record<string, number> = { all: 0, sh: 0, sz: 0, bj: 0 };
  for (const g of grouped) {
    counts[g.market] = g._count.code;
    counts.all += g._count.code;
  }
  return { list, counts };
};

// 某股某日的席位明细（买入前五 / 卖出前五）
export const listLhbSeats = async (code: string, date: string) => {
  const rows = await prisma.lhbSeat.findMany({
    where: { code, date: toUtcDate(date) },
    orderBy: [{ direction: 'asc' }, { rank: 'asc' }]
  });
  return {
    buy: rows.filter(r => r.direction === 'buy'),
    sell: rows.filter(r => r.direction === 'sell')
  };
};

// 管理页统计：交易日数 / 个股记录 / 席位明细 / 最新日期
export const getLhbStats = async () => {
  const [dates, stockCount, seatCount, latest] = await Promise.all([
    listLhbDates(),
    prisma.lhbStock.count(),
    prisma.lhbSeat.count(),
    getLatestLhbDate()
  ]);
  return { tradeDays: dates.length, stockCount, seatCount, latestDate: latest };
};

// 删除某日全部个股+席位数据（不可恢复）
export const deleteLhbDay = async (date: string): Promise<void> => {
  const target = toUtcDate(date);
  await prisma.$transaction([
    prisma.lhbStock.deleteMany({ where: { date: target } }),
    prisma.lhbSeat.deleteMany({ where: { date: target } })
  ]);
};
