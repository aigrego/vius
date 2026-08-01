import prisma from '@/lib/prisma';
import { parseFullCode } from '@/lib/stock-code';

export type TNewsFlashInput = {
  source: string; // wallstcn / xuangubao
  externalId: string;
  title?: string | null;
  content: string;
  publishedAt: Date;
};

// 快讯关联的股票（stockCode 为 fullCode；keyword 为命中词留痕）
export type TNewsStockInput = {
  stockCode: string;
  keyword?: string | null;
};

// 快讯行 + 关联股票（返回前端时 codes 聚合成逗号分隔的 6 位裸代码，保持旧契约）
const withCodes = <T extends { newsStocks: { stockCode: string }[] }>(row: T) => {
  const { newsStocks, ...rest } = row;
  const codes = newsStocks
    .map(ns => parseFullCode(ns.stockCode).code)
    .filter(Boolean)
    .join(',');
  return { ...rest, codes: codes || null, stockCodes: newsStocks.map(ns => ns.stockCode) };
};

const includeStocks = { newsStocks: { select: { stockCode: true } } } as const;

// 批量写入快讯（按 source+externalId 唯一约束去重），返回实际插入条数
export const createNewsFlashes = async (items: TNewsFlashInput[]): Promise<number> => {
  if (items.length === 0) return 0;
  const result = await prisma.newsFlash.createMany({
    data: items.map(item => ({
      source: item.source,
      externalId: item.externalId,
      title: item.title ?? null,
      content: item.content,
      publishedAt: item.publishedAt
    })),
    skipDuplicates: true
  });
  return result.count;
};

// 批量写入快讯-股票关联（sync-news 在落快讯后调用；重复关联靠唯一约束幂等）
// items 的 key 用于找回 news id：source + externalId
export const syncNewsStocks = async (
  items: { source: string; externalId: string; stocks: TNewsStockInput[] }[]
): Promise<number> => {
  const withStocks = items.filter(i => i.stocks.length > 0);
  if (withStocks.length === 0) return 0;

  // 按 source+externalId 找回快讯 id（createMany 不返回 id，且部分行可能已存在）
  const news = await prisma.newsFlash.findMany({
    where: {
      OR: withStocks.map(i => ({ source: i.source, externalId: i.externalId }))
    },
    select: { id: true, source: true, externalId: true }
  });
  const idMap = new Map(news.map(n => [`${n.source}:${n.externalId}`, n.id]));

  const rows = withStocks.flatMap(i => {
    const newsId = idMap.get(`${i.source}:${i.externalId}`);
    if (!newsId) return [];
    return i.stocks.map(s => ({ newsId, stockCode: s.stockCode, keyword: s.keyword ?? null }));
  });
  if (rows.length === 0) return 0;
  const result = await prisma.newsStock.createMany({ data: rows, skipDuplicates: true });
  return result.count;
};

// 分页查询快讯列表（按发布时间倒序），onlyMatched 时只返回已关联股票的
export const getNewsFlashList = async (options: {
  page?: number;
  pageSize?: number;
  onlyMatched?: boolean;
} = {}) => {
  const { page = 1, pageSize = 30, onlyMatched = false } = options;
  const where = onlyMatched ? { newsStocks: { some: {} } } : {};
  const [total, list] = await Promise.all([
    prisma.newsFlash.count({ where }),
    prisma.newsFlash.findMany({
      where,
      include: includeStocks,
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);
  return { list: list.map(withCodes), total };
};

// 按股票查询相关快讯（fullCode 精确关联），按发布时间倒序
export const getNewsByCode = async (stockCode: string, limit: number = 50) => {
  const list = await prisma.newsFlash.findMany({
    where: { newsStocks: { some: { stockCode } } },
    include: includeStocks,
    orderBy: { publishedAt: 'desc' },
    take: limit
  });
  return list.map(withCodes);
};

// 近 N 天已关联快讯的计数（按 fullCode 聚合），dashboard 总览「资讯关联」用
export const getNewsCountByStockCodes = async (days: number = 7): Promise<Map<string, number>> => {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const rows = await prisma.newsStock.findMany({
    where: { news: { publishedAt: { gte: since } } },
    select: { stockCode: true }
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.stockCode, (map.get(r.stockCode) ?? 0) + 1);
  return map;
};

// 资讯管理页统计：总数 / 已关联个股 / 今日新增（北京时间）/ 最新快讯时间
export const getNewsFlashManageStats = async () => {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const todayStart = new Date(`${todayStr}T00:00:00+08:00`);
  const [total, matched, todayCount, latest] = await Promise.all([
    prisma.newsFlash.count(),
    prisma.newsFlash.count({ where: { newsStocks: { some: {} } } }),
    prisma.newsFlash.count({ where: { publishedAt: { gte: todayStart } } }),
    prisma.newsFlash.findFirst({ orderBy: { publishedAt: 'desc' }, select: { publishedAt: true } })
  ]);
  return { total, matched, todayCount, latestAt: latest?.publishedAt ?? null };
};
