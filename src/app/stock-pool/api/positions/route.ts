import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import { resolveStock } from '@/lib/stock-resolver';
import prisma from '@/lib/prisma';

// 股票代码格式（会被拼进外部行情 URL，必须严格校验）
const CODE_PATTERN = /^[0-9A-Za-z.]{1,12}$/;

// GET /api/positions - 获取当前用户的持仓记录（按账号隔离，同一股票可多条）
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

    const positions = await prisma.position.findMany({
      where: { userId: session.uid },
      orderBy: { createdAt: 'desc' }
    });

    // Decimal 序列化为字符串，统一转成 number 方便前端直接计算
    const data = positions.map(p => ({
      ...p,
      price: Number(p.price),
      sellPrice: p.sellPrice === null ? null : Number(p.sellPrice)
    }));

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Get positions error:', error);
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    );
  }
}

// POST /api/positions - 新增持仓记录（code + 买入价 + 买入数量，名称/市场自动解析）
export async function POST(request: Request) {
  try {
    // 路由权限：/positions 写操作需 rw
    const auth = await requireRouteAccess('/positions', { write: true });
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
    const { code, price, quantity } = body;

    if (!code || price === undefined || quantity === undefined) {
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

    const priceNum = Number(price);
    const quantityNum = Number(quantity);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return NextResponse.json(
        { success: false, error: '买入价必须大于 0' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(quantityNum) || quantityNum <= 0) {
      return NextResponse.json(
        { success: false, error: '买入数量必须为正整数' },
        { status: 400 }
      );
    }

    // 自动解析名称/市场（stock_basic 优先，实时行情兜底）
    const resolved = await resolveStock(code);
    if (!resolved) {
      return NextResponse.json(
        { success: false, error: '无法识别该股票代码，请确认后重试' },
        { status: 400 }
      );
    }

    const agentId = session.username || 'web-ui';

    // 写操作与审计日志包在同一事务中
    const [position] = await prisma.$transaction([
      prisma.position.create({
        data: {
          userId: session.uid,
          code,
          name: resolved.name,
          market: resolved.market,
          price: priceNum,
          quantity: quantityNum
        }
      }),
      prisma.auditLog.create({
        data: {
          action: 'CREATE',
          code,
          details: `Created position: ${resolved.name} (${code}) ${quantityNum}股 @ ${priceNum}`,
          agentId
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      data: { ...position, price: Number(position.price) }
    });

  } catch (error) {
    console.error('Create position error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create position' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
