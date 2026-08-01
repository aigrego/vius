import { NextRequest, NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import { getLatestTradeDate } from '@/model/StockTrade';
import { parseFullCode } from '@/lib/stock-code';
import prisma from '@/lib/prisma';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 200;

// GET /api/ashare/rank?order=desc|asc&limit=50 - A股涨跌幅排行（最新交易日期）
// dashboard 左列「A股总览」用；返回 { date, list: [{code,name,market,close,changePct}] }
export const GET = async (request: NextRequest) => {
  try {
    await requireUser();
    // 路由权限：/ashare 为 hidden 时 403
    const auth = await requireRouteAccess('/ashare');
    if (auth instanceof NextResponse) return auth;

    const searchParams = request.nextUrl.searchParams;
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    const latestDate = await getLatestTradeDate();
    if (!latestDate) {
      return NextResponse.json({ code: 200, data: { date: null, list: [] }, message: '暂无日线数据' });
    }

    // 该日全部有涨跌幅的交易行（仅股票，排除指数/ETF），join 字典补名称/市场
    const rows = await prisma.stockTrade.findMany({
      where: { date: latestDate, changePct: { not: null }, stock: { type: 'stock' } },
      orderBy: { changePct: order },
      take: limit,
      select: {
        stockCode: true,
        current: true,
        changePct: true,
        stock: { select: { name: true, market: true } }
      }
    });

    // 保持旧契约：code 为 6 位裸码、market 小写、close 取自 current
    const list = rows.map(r => ({
      code: parseFullCode(r.stockCode).code,
      name: r.stock.name,
      market: r.stock.market.toLowerCase(),
      close: r.current,
      changePct: r.changePct
    }));

    return NextResponse.json({
      code: 200,
      data: { date: latestDate.toISOString().slice(0, 10), list },
      message: '请求成功'
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    console.error('[api/ashare/rank] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};
