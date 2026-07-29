import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import prisma from '@/lib/prisma';

// 支持的市场枚举
const VALID_MARKETS = ['sh', 'sz', 'bj', 'hk', 'us'];
// 股票代码格式（会被拼进外部行情 URL，必须严格校验）
const CODE_PATTERN = /^[0-9A-Za-z.]{1,12}$/;

// GET /api/stocks/[code] - 获取当前用户的单个股票
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
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

    const { code } = await params;

    const stock = await prisma.watchlist.findUnique({
      where: { userId_code: { userId: session.uid, code } }
    });

    if (!stock) {
      return NextResponse.json(
        { success: false, error: 'Stock not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...stock,
        alerts: JSON.parse(stock.alertsJson || '{}')
      }
    });

  } catch (error) {
    console.error('Get stock error:', error);
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    );
  }
}

// PUT /api/stocks/[code] - 更新股票
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
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

    const { code } = await params;
    const body = await request.json();

    const { name, market, type, cost, alerts } = body;

    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid stock code' },
        { status: 400 }
      );
    }

    if (market && !VALID_MARKETS.includes(market)) {
      return NextResponse.json(
        { success: false, error: 'Invalid market' },
        { status: 400 }
      );
    }

    // 写操作与审计日志包在同一事务中（按用户隔离，只能改自己的股票）
    const [stock] = await prisma.$transaction([
      prisma.watchlist.update({
        where: { userId_code: { userId: session.uid, code } },
        data: {
          ...(name && { name }),
          ...(market && { market }),
          ...(type && { type }),
          ...(cost !== undefined && { cost }),
          ...(alerts && { alertsJson: JSON.stringify(alerts) })
        }
      }),
      prisma.auditLog.create({
        data: {
          action: 'UPDATE',
          code,
          details: `Updated stock: ${name || code}`,
          agentId: session.username || 'web-ui'
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      data: {
        ...stock,
        alerts: JSON.parse(stock.alertsJson || '{}')
      }
    });

  } catch (error: any) {
    console.error('Update stock error:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Stock not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update stock' },
      { status: 500 }
    );
  }
}

// DELETE /api/stocks/[code] - 删除股票
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
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

    const { code } = await params;

    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid stock code' },
        { status: 400 }
      );
    }

    // 写操作与审计日志包在同一事务中（按用户隔离，只能删自己的股票）
    await prisma.$transaction([
      prisma.watchlist.delete({
        where: { userId_code: { userId: session.uid, code } }
      }),
      prisma.auditLog.create({
        data: {
          action: 'DELETE',
          code,
          details: `Deleted stock: ${code}`,
          agentId: session.username || 'web-ui'
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: 'Stock deleted successfully'
    });

  } catch (error: any) {
    console.error('Delete stock error:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Stock not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to delete stock' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
