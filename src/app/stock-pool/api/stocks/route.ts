import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import prisma from '@/lib/prisma';

// 支持的市场枚举
const VALID_MARKETS = ['sh', 'sz', 'bj', 'hk', 'us'];
// 股票代码格式（会被拼进外部行情 URL，必须严格校验）
const CODE_PATTERN = /^[0-9A-Za-z.]{1,12}$/;

// GET /api/stocks - 获取当前用户的股票池（按账号隔离）
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

// POST /api/stocks - 创建股票
export async function POST(request: Request) {
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

    const body = await request.json();

    const { code, name, market, type, cost, alerts } = body;

    if (!code || !name || !market) {
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

    if (!VALID_MARKETS.includes(market)) {
      return NextResponse.json(
        { success: false, error: 'Invalid market' },
        { status: 400 }
      );
    }

    const agentId = session.username || 'web-ui';

    // 写操作与审计日志包在同一事务中
    const [stock] = await prisma.$transaction([
      prisma.watchlist.create({
        data: {
          userId: session.uid,
          code,
          name,
          market,
          type: type || 'individual',
          cost: cost || 0,
          alertsJson: JSON.stringify(alerts || {})
        }
      }),
      prisma.auditLog.create({
        data: {
          action: 'CREATE',
          code,
          details: `Created stock: ${name} (${code})`,
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
