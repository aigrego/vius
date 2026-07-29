import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import { fetchRealtimeQuotes, RealtimeQuote } from '@/lib/realtime';

// 简单内存 TTL 缓存：防止多客户端高频轮询打爆外部行情源
const CACHE_TTL_MS = 3000;
const quoteCache = new Map<string, { expires: number; payload: any }>();

// GET /api/positions/realtime - 获取当前用户持仓股票的实时行情（按账号隔离）
export async function GET() {
  try {
    // 路由权限：/positions 为 hidden 时 403
    const auth = await requireRouteAccess('/positions');
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

    // 持仓中记录涉及的去重股票代码（已卖出的不再拉行情；market 为建仓时解析的结果，作为行情源提示）
    const positions = await prisma.position.findMany({
      where: { userId: session.uid, status: 'holding' },
      select: { code: true, market: true },
      distinct: ['code']
    });

    if (positions.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    // 同一用户同一批 codes 在 TTL 内直接返回缓存
    const cacheKey = `${session.uid}:${positions.map(p => p.code).sort().join(',')}`;
    const cached = quoteCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.payload);
    }

    const codes = positions.map(p => p.code);
    const markets = positions.map(p => p.market);

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

    const payload = {
      success: true,
      data: realtimeData,
      meta: {
        source: Object.values(realtimeData)[0]?.source || 'unknown',
        count: Object.keys(realtimeData).length,
        total: positions.length
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
    console.error('GET /api/positions/realtime error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch realtime data' },
      { status: 500 }
    );
  }
}

export const revalidate = 0;
export const dynamic = 'force-dynamic';
