import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser, UnauthorizedError } from '@/lib/session';

// GET /api/stats - 获取当前用户股票池的统计数据（按账号隔离）
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

    const mine = { userId: session.uid };
    const [total, withPosition, etfs, hkUs] = await Promise.all([
      prisma.watchlist.count({ where: mine }),
      prisma.watchlist.count({
        where: { ...mine, cost: { gt: 0 } }
      }),
      prisma.watchlist.count({
        where: { ...mine, type: 'etf' }
      }),
      prisma.watchlist.count({
        where: {
          ...mine,
          OR: [
            { market: 'hk' },
            { market: 'us' }
          ]
        }
      })
    ]);
    
    return NextResponse.json({
      success: true,
      data: {
        total,
        withPosition,
        etfs,
        hkUs
      }
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
