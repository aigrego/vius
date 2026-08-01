import prisma from '@/lib/prisma';

// A 股数据总览统计（/api/ashare/stats 用）
export type TAshareStats = {
  stocks: number; // 在市股票总数
  dailyDate: string | null; // 最新日线日期 YYYY-MM-DD
  dailyCount: number; // 最新日期的日线条数
  fullHistory: number; // 历史日线 >=250 根的股票数
  signals: {
    date: string | null; // 最新信号日期
    bottomVolume: number; // 当日底部放量信号数
    topVolume: number; // 当日顶部放量信号数
  };
  news: {
    total: number; // 快讯总数
    matched: number; // 已关联股票的快讯数
    latest: Date | null; // 最新快讯发布时间
  };
};

const FULL_HISTORY_BARS = 250;

// 汇总 stock_dict / stock_trade / stock_signal / news_flash 的核心统计
export const getAshareStats = async (): Promise<TAshareStats> => {
  const [stocks, latestDaily, fullHistoryRows, latestSignal, newsTotal, newsMatched, latestNews] =
    await Promise.all([
      prisma.stockDict.count({ where: { isActive: true, type: 'stock' } }),
      prisma.stockTrade.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
      // 历史已满（>=250 根）的股票数：groupBy having 的子查询计数
      prisma.$queryRaw<{ cnt: bigint }[]>`
        SELECT COUNT(*) AS cnt FROM (
          SELECT stock_code FROM stock_trade GROUP BY stock_code HAVING COUNT(*) >= ${FULL_HISTORY_BARS}
        ) t
      `,
      prisma.stockSignal.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
      prisma.newsFlash.count(),
      prisma.newsFlash.count({ where: { newsStocks: { some: {} } } }),
      prisma.newsFlash.findFirst({ orderBy: { publishedAt: 'desc' }, select: { publishedAt: true } })
    ]);

  const dailyDate = latestDaily?.date ?? null;
  const dailyCount = dailyDate
    ? await prisma.stockTrade.count({ where: { date: dailyDate } })
    : 0;

  // 最新信号日期的两类信号计数
  const signalDate = latestSignal?.date ?? null;
  let bottomVolume = 0;
  let topVolume = 0;
  if (signalDate) {
    const grouped = await prisma.stockSignal.groupBy({
      by: ['type'],
      where: { date: signalDate },
      _count: { type: true }
    });
    for (const g of grouped) {
      if (g.type === 'bottom_volume') bottomVolume = g._count.type;
      else if (g.type === 'top_volume') topVolume = g._count.type;
    }
  }

  return {
    stocks,
    dailyDate: dailyDate ? dailyDate.toISOString().slice(0, 10) : null,
    dailyCount,
    // $queryRaw 的 COUNT 返回 BigInt，转 Number 供 JSON 序列化
    fullHistory: Number(fullHistoryRows[0]?.cnt ?? 0),
    signals: {
      date: signalDate ? signalDate.toISOString().slice(0, 10) : null,
      bottomVolume,
      topVolume
    },
    news: {
      total: newsTotal,
      matched: newsMatched,
      latest: latestNews?.publishedAt ?? null
    }
  };
};
