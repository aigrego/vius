import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import { parseFullCode } from '@/lib/stock-code';
import prisma from '@/lib/prisma';

// POST /api/positions/[id]/sell - 卖出持仓（全部或部分；部分卖出拆行：原记录减量 + 新建一条 sold 记录）
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const positionId = parseInt(id, 10);
    if (!Number.isInteger(positionId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid position id' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { price } = body;
    const sellPriceNum = Number(price);
    if (!Number.isFinite(sellPriceNum) || sellPriceNum <= 0) {
      return NextResponse.json(
        { success: false, error: '卖出价必须大于 0' },
        { status: 400 }
      );
    }

    // 需要原记录数据做拆行，先按 id + userId 查出（天然限定归属）；带上字典名称供审计/响应使用
    const position = await prisma.position.findFirst({
      where: { id: positionId, userId: session.uid },
      include: { stock: true }
    });
    if (!position) {
      return NextResponse.json(
        { success: false, error: 'Position not found' },
        { status: 404 }
      );
    }
    if (position.status !== 'holding') {
      return NextResponse.json(
        { success: false, error: '该记录已卖出' },
        { status: 400 }
      );
    }

    // quantity 缺省 = 全部卖出
    const sellQty = body.quantity === undefined
      ? position.quantity
      : Number(body.quantity);
    if (!Number.isInteger(sellQty) || sellQty <= 0 || sellQty > position.quantity) {
      return NextResponse.json(
        { success: false, error: '卖出数量必须为不超过持仓数量的正整数' },
        { status: 400 }
      );
    }

    const soldAt = new Date();
    const agentId = session.username || 'web-ui';
    const buyPrice = Number(position.price);
    const realizedPnl = (sellPriceNum - buyPrice) * sellQty;

    const ops = [];
    if (sellQty === position.quantity) {
      // 全部卖出：原记录直接置 sold
      ops.push(prisma.position.update({
        where: { id: positionId },
        data: { status: 'sold', sellPrice: sellPriceNum, soldAt }
      }));
    } else {
      // 部分卖出：原记录减量（仍 holding），新建一条同买入价的 sold 记录（名称/市场以字典为准，不再冗余）
      ops.push(prisma.position.update({
        where: { id: positionId },
        data: { quantity: position.quantity - sellQty }
      }));
      ops.push(prisma.position.create({
        data: {
          userId: session.uid,
          stockCode: position.stockCode,
          price: position.price,
          quantity: sellQty,
          status: 'sold',
          sellPrice: sellPriceNum,
          soldAt
        }
      }));
    }
    ops.push(prisma.auditLog.create({
      data: {
        action: 'SELL',
        code: position.stockCode,
        details: `Sold position: ${position.stock.name} (${position.stockCode}) ${sellQty}股 @ ${sellPriceNum}（买入价 ${buyPrice}，已实现盈亏 ${realizedPnl.toFixed(2)}）`,
        agentId
      }
    }));

    await prisma.$transaction(ops);

    return NextResponse.json({
      success: true,
      data: {
        id: positionId,
        code: parseFullCode(position.stockCode).code,
        sellQuantity: sellQty,
        sellPrice: sellPriceNum,
        realizedPnl,
        remaining: position.quantity - sellQty
      }
    });

  } catch (error) {
    console.error('Sell position error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sell position' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
