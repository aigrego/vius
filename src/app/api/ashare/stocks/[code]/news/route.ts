import { handleApiError } from '@/utils/api-response';
import { NextRequest, NextResponse } from 'next/server';
import { getNewsByCode } from '@/model/NewsFlash';
import { requireRouteAccess } from '@/lib/route-perm';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const CODE_PATTERN = /^\d{6}$/;
const MAX_LIMIT = 100;

// GET /api/ashare/stocks/[code]/news - 个股关联快讯（按发布时间倒序）
export const GET = async (
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) => {
  try {
    // 路由权限：/ashare 为 hidden 时 403
    const auth = await requireRouteAccess('/ashare');
    if (auth instanceof NextResponse) return auth;

    const { code } = await ctx.params;
    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json(
        { code: 400, data: null, message: '股票代码格式不正确（应为 6 位数字）' },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') || '30', 10) || 30)
    );

    const news = await getNewsByCode(code, limit);

    return NextResponse.json({
      code: 200,
      data: news,
      message: '请求成功'
    });
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 });
  }
};
