import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import { fetchRealtimeQuotes } from '@/lib/realtime';
import { getTradesByDate } from '@/model/StockTrade';
import { parseFullCode } from '@/lib/stock-code';

// 简单内存 TTL 缓存：防止多客户端高频轮询打爆外部行情源
const CACHE_TTL_MS = 3000;
const quoteCache = new Map<string, { expires: number; payload: any }>();

// GET /api/realtime - 获取当前用户股票池的实时股价（按账号隔离）
// 价格链路：先读 stock_trade 当日行（sync-snapshot 盘中刷新），缺行的代码兜底三源实时行情
export async function GET() {
  try {
    // 路由权限：/pool 为 hidden 时 403
    const auth = await requireRouteAccess('/pool');
    if (auth instanceof NextResponse) return auth;
    let session;
    try {
      session = await requireUser();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return NextResponse.json(
          { success: false, error: '未登录' },
          { status: 401 }
        );
      }
      throw e;
    }

    // 获取当前用户的股票代码（字典关联提供名称/市场，市场作兜底行情源提示）
    const stocks = await prisma.watchlist.findMany({
      where: { userId: session.uid },
      select: { stockCode: true, cost: true, stock: { select: { name: true, market: true } } }
    });

    if (stocks.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    // 同一用户同一批 codes 在 TTL 内直接返回缓存
    const cacheKey = `${session.uid}:${stocks.map(s => s.stockCode).sort().join(',')}`;
    const cached = quoteCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.payload);
    }

    // 先读库内当日快照
    const trades = await getTradesByDate(stocks.map(s => s.stockCode));

    // 缺当日行（或当日无价）的代码兜底三源实时行情；兜底失败不阻塞，仅缺失对应代码
    const missing = stocks.filter(s => {
      const row = trades.get(s.stockCode);
      return !row || row.current == null;
    });
    const fallbackByCode = new Map<string, RealtimeQuoteLike>();
    if (missing.length > 0) {
      try {
        const quotes = await fetchRealtimeQuotes(
          missing.map(s => parseFullCode(s.stockCode).code),
          missing.map(s => s.stock.market.toLowerCase())
        );
        for (const q of quotes) fallbackByCode.set(q.code.toUpperCase(), q);
      } catch (error) {
        console.warn('Realtime fallback failed, 仅返回库内快照:', error);
      }
    }

    // 合并行情并计算盈亏（输出 key 为 6 位裸码，保持旧前端契约）
    const enrichedData: Record<string, any> = {};

    for (const stock of stocks) {
      const bareCode = parseFullCode(stock.stockCode).code;
      const row = trades.get(stock.stockCode);
      let sourceData: RealtimeQuoteLike | undefined;

      if (row && row.current != null) {
        const prevClose = row.prevClose ?? 0;
        sourceData = {
          code: bareCode,
          name: stock.stock.name,
          current: row.current,
          changePct: row.changePct ?? (prevClose > 0
            ? Math.round((row.current - prevClose) / prevClose * 10000) / 100
            : 0),
          volume: row.volume ?? 0,
          open: row.open ?? 0,
          close: prevClose,
          high: row.high ?? 0,
          low: row.low ?? 0,
          amount: row.amount ?? 0,
          source: 'db'
        };
      } else {
        const q = fallbackByCode.get(bareCode.toUpperCase());
        if (q) sourceData = { ...q, code: bareCode, name: q.name || stock.stock.name };
      }

      if (sourceData) {
        const cost = Number(stock.cost);
        const pnlPct = cost > 0 && sourceData.current > 0
          ? Math.round((sourceData.current - cost) / cost * 10000) / 100
          : 0;

        const pnlAmount = cost > 0
          ? Math.round((sourceData.current - cost) * 100) / 100
          : 0;

        enrichedData[bareCode] = {
          ...sourceData,
          code: bareCode,
          pnlPct,
          pnlAmount,
          cost
        };
      }
    }

    const payload = {
      success: true,
      data: enrichedData,
      meta: {
        source: Object.values(enrichedData)[0]?.source || 'unknown',
        count: Object.keys(enrichedData).length,
        total: stocks.length
      },
      updatedAt: new Date().toISOString()
    };

    // 写入缓存（顺带清理过期条目，避免 Map 无限增长）
    for (const [key, entry] of quoteCache) {
      if (entry.expires <= Date.now()) quoteCache.delete(key);
    }
    quoteCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, payload });

    return NextResponse.json(payload);

  } catch (error) {
    console.error('GET /api/realtime error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch realtime data' },
      { status: 500 }
    );
  }
}

// 库内快照与实时兜底归一后的行情形状（close = 昨收）
type RealtimeQuoteLike = {
  code: string;
  name: string;
  current: number;
  changePct: number;
  volume: number;
  open: number;
  close: number;
  high: number;
  low: number;
  amount: number;
  source: string;
};

// 配置 - 禁用缓存
export const revalidate = 0;
export const dynamic = 'force-dynamic';
