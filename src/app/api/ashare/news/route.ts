import { handleApiError } from '@/utils/api-response';
import { NextRequest, NextResponse } from 'next/server';
import { getNewsFlashList } from '@/model/NewsFlash';

// 声明为动态路由：依赖 searchParams，避免构建期静态化/缓存
export const dynamic = 'force-dynamic';

const MAX_PAGE_SIZE = 100;

// GET /api/ashare/news - 快讯列表（分页，onlyMatched=1 时只返回已关联股票的）
export const GET = async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get('pageSize') || '30', 10) || 30)
    );
    const onlyMatched = searchParams.get('onlyMatched') === '1';

    const { list, total } = await getNewsFlashList({ page, pageSize, onlyMatched });

    return NextResponse.json({
      code: 200,
      data: { list, total, page, pageSize },
      message: '请求成功'
    });
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 });
  }
};
