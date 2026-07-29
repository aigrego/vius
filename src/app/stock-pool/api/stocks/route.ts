import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import { resolveStock } from '@/lib/stock-resolver';
import { fetchRealtimeQuotes } from '@/lib/realtime';
import prisma from '@/lib/prisma';

// 股票代码格式（会被拼进外部行情 URL，必须严格校验）
const CODE_PATTERN = /^[0-9A-Za-z.]{1,12}$/;

// GET /api/stocks - 获取当前用户的股票池（按账号隔离）
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

    const stocks = await prisma.watchlist.findMany({
      where: { userId: session.uid },
      orderBy: { createdAt: 'desc' }
    });

    // 解析 alertsJson
    const parsedStocks = stocks.map(stock => ({
      ...stock,
      alerts: JSON.parse(stock.alertsJson || '{}')
    }));

    return NextResponse.json({ success: true, data: parsedStocks });

  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    );
  }
}

// POST /api/stocks - 创建股票（只需 code，名称/市场/类型由服务端自动解析）
export async function POST(request: Request) {
  try {
    // 路由权限：/pool 写操作需 rw
    const auth = await requireRouteAccess('/pool', { write: true });
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

    const body = await request.json();

    const { code, alerts } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid stock code' },
        { status: 400 }
      );
    }

    // 自动解析名称/市场/类型（stock_basic 优先，实时行情兜底）
    const resolved = await resolveStock(code);
    if (!resolved) {
      return NextResponse.json(
        { success: false, error: '无法识别该股票代码，请确认后重试' },
        { status: 400 }
      );
    }

    // 关注价（markPrice）：best-effort 拉一次实时行情取当前价，失败为 null 不影响创建；
    // 放在事务前，随 create 一次写入，避免创建后再补一次 update
    let markPrice: number | null = null;
    try {
      const quotes = await fetchRealtimeQuotes([code], [resolved.market]);
      const current = quotes.find(q => q.code.toUpperCase() === code.toUpperCase())?.current;
      if (current && current > 0) markPrice = current;
    } catch (e) {
      console.warn(`Create stock: 关注价获取失败 ${code}:`, e);
    }

    const agentId = session.username || 'web-ui';

    // 写操作与审计日志包在同一事务中
    const [stock] = await prisma.$transaction([
      prisma.watchlist.create({
        data: {
          userId: session.uid,
          code,
          name: resolved.name,
          market: resolved.market,
          type: resolved.type,
          cost: 0,
          markPrice,
          alertsJson: JSON.stringify(alerts || {})
        }
      }),
      prisma.auditLog.create({
        data: {
          action: 'CREATE',
          code,
          details: `Created stock: ${resolved.name} (${code})`,
          agentId
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      data: { ...stock, alerts: JSON.parse(stock.alertsJson) }
    });

  } catch (error: any) {
    console.error('Create stock error:', error);
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Stock code already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create stock' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
