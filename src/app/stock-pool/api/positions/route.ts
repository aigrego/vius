import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import { resolveStock } from '@/lib/stock-resolver';
import { ensureStockDict } from '@/model/StockDict';
import { parseFullCode } from '@/lib/stock-code';
import prisma from '@/lib/prisma';

// 股票代码格式（会被拼进外部行情 URL，必须严格校验）
const CODE_PATTERN = /^[0-9A-Za-z.]{1,12}$/;

// 展开字典关联为旧契约字段：code（6 位裸码）/ name / market（小写）；Decimal 转 number 方便前端直接计算
const toLegacyPosition = <T extends { stockCode: string; price: unknown; sellPrice: unknown; stock: { name: string; market: string } }>(
  p: T
) => {
  const { stock, ...row } = p;
  return {
    ...row,
    code: parseFullCode(row.stockCode).code,
    name: stock.name,
    market: stock.market.toLowerCase(),
    price: Number(row.price),
    sellPrice: row.sellPrice === null ? null : Number(row.sellPrice)
  };
};

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
      orderBy: { createdAt: 'desc' },
      include: { stock: true }
    });

    return NextResponse.json({ success: true, data: positions.map(toLegacyPosition) });

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

    // 自动解析 fullCode/名称/市场（stock_dict 优先，实时行情兜底）
    const resolved = await resolveStock(code);
    if (!resolved) {
      return NextResponse.json(
        { success: false, error: '无法识别该股票代码，请确认后重试' },
        { status: 400 }
      );
    }

    // 字典懒建行（position 的外键依赖字典行）
    await ensureStockDict({
      code: resolved.stockCode,
      name: resolved.name,
      market: resolved.market,
      type: resolved.type === 'individual' ? 'stock' : resolved.type
    });

    const agentId = session.username || 'web-ui';

    // 写操作与审计日志包在同一事务中
    const [position] = await prisma.$transaction([
      prisma.position.create({
        data: {
          userId: session.uid,
          stockCode: resolved.stockCode,
          price: priceNum,
          quantity: quantityNum
        },
        include: { stock: true }
      }),
      prisma.auditLog.create({
        data: {
          action: 'CREATE',
          code: resolved.stockCode,
          details: `Created position: ${resolved.name} (${resolved.stockCode}) ${quantityNum}股 @ ${priceNum}`,
          agentId
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      data: toLegacyPosition(position)
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
