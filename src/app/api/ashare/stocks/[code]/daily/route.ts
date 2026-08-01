import { handleApiError } from '@/utils/api-response';
import { NextRequest, NextResponse } from 'next/server';
import { getStockTrades } from '@/model/StockTrade';
import { toFullCode } from '@/lib/stock-code';
import { requireRouteAccess } from '@/lib/route-perm';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const CODE_PATTERN = /^\d{6}$/;
const MAX_LIMIT = 500;

// GET /api/ashare/stocks/[code]/daily - 单股日线历史（stock_trade，返回按日期升序，方便前端画图）
// market 参数可选（sh/sz/bj，缺省按 A 股代码前缀推断）
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
    const market = searchParams.get('market')?.trim() || undefined;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') || '120', 10) || 120)
    );

    // model 层按日期倒序返回，翻转为升序后给前端
    const trades = (await getStockTrades(toFullCode(code, market), limit)).reverse();

    // 保持旧字段名：close 取自 current（现价，收盘后=收盘价）
    const data = trades.map(t => ({
      date: t.date.toISOString().slice(0, 10),
      open: t.open,
      close: t.current,
      high: t.high,
      low: t.low,
      volume: t.volume,
      amount: t.amount,
      changePct: t.changePct,
      turnover: t.turnover
    }));

    return NextResponse.json({
      code: 200,
      data,
      message: '请求成功'
    });
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 });
  }
};
