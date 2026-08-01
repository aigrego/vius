import { NextRequest, NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { getPlate, getPlateStocks } from '@/model/Plate';
import { getTradesByDate } from '@/model/StockTrade';
import { parseFullCode } from '@/lib/stock-code';

// 声明为动态路由
export const dynamic = 'force-dynamic';

/* GET /api/stocks/plates/[code]/stocks - 板块成分股（含当日行情快照）
   [code] 为 plate.code（如 xgb:886001、qq:pt0124，URL 编码传入）；
   成分股行情读 stock_trade 当日行，无当日行的 current/changePct 给 null 并排最后。 */
export const GET = async (
  _: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) => {
  try {
    await requireUser();

    const { code } = await ctx.params;
    const plate = await getPlate(code);
    if (!plate) {
      return NextResponse.json(
        { code: 404, data: null, message: `板块不存在: ${code}` },
        { status: 404 }
      );
    }

    const plateStocks = await getPlateStocks(code);
    const trades = await getTradesByDate(plateStocks.map(ps => ps.stockCode));

    const list = plateStocks.map(ps => {
      const trade = trades.get(ps.stockCode);
      return {
        stockCode: ps.stockCode,
        code: parseFullCode(ps.stockCode).code, // 6 位裸码
        name: ps.stock.name,
        market: ps.stock.market.toLowerCase(),
        current: trade?.current ?? null,
        changePct: trade?.changePct ?? null
      };
    });

    // 按涨跌幅降序，无当日行情（null）的排最后
    list.sort((a, b) => {
      if (a.changePct === null && b.changePct === null) return 0;
      if (a.changePct === null) return 1;
      if (b.changePct === null) return -1;
      return b.changePct - a.changePct;
    });

    return NextResponse.json({
      code: 200,
      data: {
        plate: { code: plate.code, name: plate.name, kind: plate.kind, source: plate.source },
        list,
        updatedAt: plate.updatedAt
      },
      message: 'success'
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    console.error('[api/stocks/plates/[code]/stocks] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '板块成分股查询失败' }, { status: 500 });
  }
};
