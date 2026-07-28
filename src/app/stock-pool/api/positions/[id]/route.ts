import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import prisma from '@/lib/prisma';

// DELETE /api/positions/[id] - 删除一条持仓记录（按用户隔离，只能删自己的）
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
