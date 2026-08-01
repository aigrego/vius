import { handleApiError } from '@/utils/api-response';
import { NextResponse } from 'next/server';
import { getStockTrades } from '@/model/StockTrade';
import { toFullCode } from '@/lib/stock-code';
import { calculateChipDistribution } from '@/lib/analysis/chip-distribution';
import { requireRouteAccess } from '@/lib/route-perm';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const CODE_PATTERN = /^\d{6}$/;
// 筹码分布取近 250 根日线
const DAILY_LIMIT = 250;
// 日线不足该数量时认为数据不够，无法给出有意义的筹码分布
const MIN_BARS = 20;

// GET /api/ashare/stocks/[code]/chips - 筹码分布（三角衰减模型近似计算）
export const GET = async (
  _: Request,
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

    // model 层按日期倒序返回，翻转为升序供筹码计算；
    // stock_trade 字段可空，价格/量额不全的行剔除（turnover 可为 null，计算时自动跳过该日）
    const bars = (await getStockTrades(toFullCode(code), DAILY_LIMIT))
      .reverse()
      .filter(t => t.current != null && t.high != null && t.low != null && t.volume != null && t.amount != null)
      .map(t => ({
        date: t.date.toISOString().slice(0, 10),
        current: t.current!,
        high: t.high!,
        low: t.low!,
        volume: t.volume!,
        amount: t.amount!,
        turnover: t.turnover
      }));

    if (bars.length < MIN_BARS) {
      // 数据不足不抛错，用统一响应结构告知前端
      return NextResponse.json({
        code: 4001,
        data: null,
        message: `日线数据不足（当前 ${bars.length} 根，至少需 ${MIN_BARS} 根），暂无法计算筹码分布`
      });
    }

    const currentPrice = bars[bars.length - 1]!.current;
    const distribution = calculateChipDistribution(bars, currentPrice);

    if (!distribution) {
      return NextResponse.json({
        code: 4001,
        data: null,
        message: '换手率等数据缺失，暂无法计算筹码分布'
      });
    }

    return NextResponse.json({
      code: 200,
      data: { ...distribution, currentPrice },
      message: '请求成功'
    });
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 });
  }
};
