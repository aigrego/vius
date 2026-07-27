import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { fetchRealtimeQuotes, RealtimeQuote } from '@/lib/realtime';

// 简单内存 TTL 缓存：防止多客户端高频轮询打爆外部行情源
const CACHE_TTL_MS = 3000;
const quoteCache = new Map<string, { expires: number; payload: any }>();

// GET /api/realtime - 获取当前用户股票池的实时股价（按账号隔离）
export async function GET() {
  try {
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

    // 获取当前用户的股票代码
    const stocks = await prisma.watchlist.findMany({
      where: { userId: session.uid },
      select: { code: true, market: true, cost: true }
    });

    if (stocks.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    // 同一用户同一批 codes 在 TTL 内直接返回缓存
    const cacheKey = `${session.uid}:${stocks.map(s => s.code).sort().join(',')}`;
    const cached = quoteCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.payload);
    }

    // 批量获取实时数据（使用 DB 中的 market 字段作为提示）
    const codes = stocks.map(s => s.code);
    const markets = stocks.map(s => s.market);

    let realtimeData: Record<string, RealtimeQuote>;

    try {
      const quotes = await fetchRealtimeQuotes(codes, markets);
      realtimeData = {};
      for (const quote of quotes) {
        realtimeData[quote.code] = quote;
      }
    } catch (error) {
      console.error('All data sources failed:', error);
      return NextResponse.json(
        { success: false, error: 'All data sources failed', details: (error as Error).message },
        { status: 503 }
      );
    }

    // 合并持仓数据并计算盈亏
    const enrichedData: Record<string, any> = {};

    for (const stock of stocks) {
      const sourceData = realtimeData[stock.code];

      if (sourceData) {
        const cost = Number(stock.cost);
        const pnlPct = cost > 0 && sourceData.current > 0
          ? Math.round((sourceData.current - cost) / cost * 10000) / 100
          : 0;

        const pnlAmount = cost > 0
          ? Math.round((sourceData.current - cost) * 100) / 100
          : 0;

        enrichedData[stock.code] = {
          ...sourceData,
          code: stock.code,
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
        source: Object.values(realtimeData)[0]?.source || 'unknown',
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

// 配置 - 禁用缓存
export const revalidate = 0;
export const dynamic = 'force-dynamic';
