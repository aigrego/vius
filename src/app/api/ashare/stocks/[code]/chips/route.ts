import { handleApiError } from '@/utils/api-response';
import { NextResponse } from 'next/server';
import { getStockDailies } from '@/model/StockDaily';
import { calculateChipDistribution } from '@/lib/analysis/chip-distribution';

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
    const { code } = await ctx.params;
    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json(
        { code: 400, data: null, message: '股票代码格式不正确（应为 6 位数字）' },
        { status: 400 }
      );
    }

    // model 层按日期倒序返回，翻转为升序供筹码计算
    const dailies = (await getStockDailies(code, DAILY_LIMIT)).reverse();

    if (dailies.length < MIN_BARS) {
      // 数据不足不抛错，用统一响应结构告知前端
      return NextResponse.json({
        code: 4001,
        data: null,
        message: `日线数据不足（当前 ${dailies.length} 根，至少需 ${MIN_BARS} 根），暂无法计算筹码分布`
      });
    }

    const currentPrice = dailies[dailies.length - 1]!.close;
    const distribution = calculateChipDistribution(dailies, currentPrice);

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
