import { handleApiError } from '@/utils/api-response';
import { NextRequest, NextResponse } from 'next/server';
import { getStockDailies } from '@/model/StockDaily';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const CODE_PATTERN = /^\d{6}$/;
const MAX_LIMIT = 500;

// GET /api/ashare/stocks/[code]/daily - 单股日线历史（返回按日期升序，方便前端画图）
export const GET = async (
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) => {
  try {
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
      Math.max(1, parseInt(searchParams.get('limit') || '120', 10) || 120)
    );

    // model 层按日期倒序返回，翻转为升序后给前端
    const dailies = (await getStockDailies(code, limit)).reverse();

    return NextResponse.json({
      code: 200,
      data: dailies,
      message: '请求成功'
    });
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 });
  }
};
