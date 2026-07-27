import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/stats - 获取统计数据
export async function GET() {
  try {
    
    const [total, withPosition, etfs, hkUs] = await Promise.all([
      prisma.watchlist.count(),
      prisma.watchlist.count({
        where: { cost: { gt: 0 } }
      }),
      prisma.watchlist.count({
        where: { type: 'etf' }
      }),
      prisma.watchlist.count({
        where: {
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
