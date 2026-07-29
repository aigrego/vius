import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import prisma from '@/lib/prisma';

// GET /api/alerts/history - 获取当前用户的预警历史（按账号隔离）
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const limit = parseInt(searchParams.get('limit') || '50');
    const hours = parseInt(searchParams.get('hours') || '24');

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const history = await prisma.alertHistory.findMany({
      where: {
        userId: session.uid,
        createdAt: { gte: since },
        ...(code && { code })
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return NextResponse.json({
      success: true,
      data: history,
      count: history.length
    });

  } catch (error) {
    console.error('Alert history error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch alert history' },
      { status: 500 }
    );
  }
}

// DELETE /api/alerts/history - 清理旧预警历史
export async function DELETE(request: Request) {
  try {
    // 路由权限：/pool 写操作需 rw
    const auth = await requireRouteAccess('/pool', { write: true });
    if (auth instanceof NextResponse) return auth;
    try {
      await requireUser();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return NextResponse.json(
          { success: false, error: '未登录' },
          { status: 401 }
        );
      }
      throw e;
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await prisma.alertHistory.deleteMany({
      where: { createdAt: { lt: since } }
    });

    return NextResponse.json({
      success: true,
      message: `Cleaned ${result.count} old alert records`,
      deleted: result.count
    });

  } catch (error) {
    console.error('Clean alert history error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clean alert history' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
