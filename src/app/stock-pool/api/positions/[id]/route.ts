import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import prisma from '@/lib/prisma';

// PUT /api/positions/[id] - 更新持仓记录（仅买入价/数量可改，代码不可变；按用户隔离）
export async function PUT(
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
    const { price, quantity } = body;

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

    // updateMany + userId + status='holding' 条件：天然限定归属，已卖出记录不可编辑（count=0 即不存在或已卖出）
    const [updated] = await prisma.$transaction([
      prisma.position.updateMany({
        where: { id: positionId, userId: session.uid, status: 'holding' },
        data: { price: priceNum, quantity: quantityNum }
      }),
      prisma.auditLog.create({
        data: {
          action: 'UPDATE',
          details: `Updated position: #${positionId} ${quantityNum}股 @ ${priceNum}`,
          agentId: session.username || 'web-ui'
        }
      })
    ]);

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Position not found or already sold' },
        { status: 404 }
      );
    }

    const position = await prisma.position.findUnique({ where: { id: positionId } });

    return NextResponse.json({
      success: true,
      data: { ...position, price: Number(position!.price) }
    });

  } catch (error) {
    console.error('Update position error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update position' },
      { status: 500 }
    );
  }
}

// DELETE /api/positions/[id] - 删除一条持仓记录（按用户隔离，只能删自己的）
export async function DELETE(
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

    // deleteMany + userId 条件：避免先查后删的竞态，同时天然限定归属
    const [deleted] = await prisma.$transaction([
      prisma.position.deleteMany({
        where: { id: positionId, userId: session.uid }
      }),
      prisma.auditLog.create({
        data: {
          action: 'DELETE',
          details: `Deleted position: #${positionId}`,
          agentId: session.username || 'web-ui'
        }
      })
    ]);

    if (deleted.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Position not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Position deleted successfully'
    });

  } catch (error) {
    console.error('Delete position error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete position' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
