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

// GET /api/positions/realtime - 获取当前用户持仓股票的实时行情（按账号隔离）
// 价格链路：先读 stock_trade 当日行（sync-snapshot 盘中刷新），缺行的代码兜底三源实时行情
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

    // 持仓中记录涉及的去重股票代码（已卖出的不再拉行情；字典市场作兜底行情源提示）
    const positions = await prisma.position.findMany({
      where: { userId: session.uid, status: 'holding' },
      select: { stockCode: true, stock: { select: { name: true, market: true } } },
      distinct: ['stockCode']
    });

    if (positions.length === 0) {
      return NextResponse.json({ success: true, data: {} });
    }

    // 同一用户同一批 codes 在 TTL 内直接返回缓存
    const cacheKey = `${session.uid}:${positions.map(p => p.stockCode).sort().join(',')}`;
    const cached = quoteCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.payload);
    }

    // 先读库内当日快照
    const trades = await getTradesByDate(positions.map(p => p.stockCode));

    // 缺当日行（或当日无价）的代码兜底三源实时行情；兜底失败不阻塞，仅缺失对应代码
    const missing = positions.filter(p => {
      const row = trades.get(p.stockCode);
      return !row || row.current == null;
    });
    const fallbackByCode = new Map<string, RealtimeQuoteLike>();
    if (missing.length > 0) {
      try {
        const quotes = await fetchRealtimeQuotes(
          missing.map(p => parseFullCode(p.stockCode).code),
          missing.map(p => p.stock.market.toLowerCase())
        );
        for (const q of quotes) fallbackByCode.set(q.code.toUpperCase(), q);
      } catch (error) {
        console.warn('Positions realtime fallback failed, 仅返回库内快照:', error);
      }
    }

    // 合并为原始 quote 形状（输出 key 为 6 位裸码，保持旧前端契约）
    const realtimeData: Record<string, RealtimeQuoteLike> = {};
    for (const p of positions) {
      const bareCode = parseFullCode(p.stockCode).code;
      const row = trades.get(p.stockCode);
      if (row && row.current != null) {
        const prevClose = row.prevClose ?? 0;
        realtimeData[bareCode] = {
          code: bareCode,
          name: p.stock.name,
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
        if (q) realtimeData[bareCode] = { ...q, code: bareCode, name: q.name || p.stock.name };
      }
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

export const revalidate = 0;
export const dynamic = 'force-dynamic';
