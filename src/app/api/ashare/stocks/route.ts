import { handleApiError } from '@/utils/api-response';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// 声明为动态路由：依赖 searchParams，避免构建期静态化/缓存
export const dynamic = 'force-dynamic';

const VALID_MARKETS = ['sh', 'sz', 'bj'];
const MAX_PAGE_SIZE = 200;

// GET /api/ashare/stocks - A 股股票清单（支持关键字模糊搜索与分页）
export const GET = async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword')?.trim() || '';
    const market = searchParams.get('market')?.trim() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50)
    );

    if (market && !VALID_MARKETS.includes(market)) {
      return NextResponse.json(
        { code: 400, data: null, message: `market 仅支持 ${VALID_MARKETS.join('/')}` },
        { status: 400 }
      );
    }

    const where = {
      isActive: true,
      ...(market ? { market } : {}),
      ...(keyword
        ? { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] }
        : {})
    };

    const [total, list] = await Promise.all([
      prisma.stockBasic.count({ where }),
      prisma.stockBasic.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    return NextResponse.json({
      code: 200,
      data: { list, total, page, pageSize },
      message: '请求成功'
    });
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 });
  }
};
