import { NextRequest, NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import prisma from '@/lib/prisma';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 200;

// GET /api/ashare/rank?order=desc|asc&limit=50 - A股涨跌幅排行（最新日线日期）
// dashboard 左列「A股总览」用；返回 { date, list: [{code,name,market,close,changePct}] }
export const GET = async (request: NextRequest) => {
  try {
    await requireUser();

    const searchParams = request.nextUrl.searchParams;
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

    const latest = await prisma.stockDaily.findFirst({
      orderBy: { date: 'desc' },
      select: { date: true }
    });
    if (!latest) {
      return NextResponse.json({ code: 200, data: { date: null, list: [] }, message: '暂无日线数据' });
    }

    const dailies = await prisma.stockDaily.findMany({
      where: { date: latest.date },
      orderBy: { changePct: order },
      take: limit,
      select: { code: true, close: true, changePct: true }
    });
    const basics = await prisma.stockBasic.findMany({
      where: { code: { in: dailies.map(d => d.code) } },
      select: { code: true, name: true, market: true }
    });
    const basicMap = new Map(basics.map(b => [b.code, b]));

    const list = dailies
      .map(d => {
        const b = basicMap.get(d.code);
        if (!b) return null;
        return { code: d.code, name: b.name, market: b.market, close: d.close, changePct: d.changePct };
      })
      .filter(Boolean);

    return NextResponse.json({
      code: 200,
      data: { date: latest.date.toISOString().slice(0, 10), list },
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
