import { NextRequest, NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { getLatestLhbDate, listLhbDates, listLhbStocks } from '@/model/Lhb';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const VALID_MARKETS = ['sh', 'sz', 'bj'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toDateStr = (d: Date): string => d.toISOString().slice(0, 10);

// GET /api/lhb?date=&market=&keyword= - 龙虎榜个股上榜列表
// date 缺省取库中最新数据日期；返回当日各市场上榜数量（tab 徽章）与可选日期列表
export const GET = async (request: NextRequest) => {
  try {
    await requireUser();

    const searchParams = request.nextUrl.searchParams;
    let date = searchParams.get('date')?.trim() || '';
    if (date && !DATE_RE.test(date)) {
      return NextResponse.json({ code: 400, data: null, message: 'date 格式应为 YYYY-MM-DD' }, { status: 400 });
    }
    const market = searchParams.get('market')?.trim() || '';
    if (market && !VALID_MARKETS.includes(market)) {
      return NextResponse.json({ code: 400, data: null, message: `market 仅支持 ${VALID_MARKETS.join('/')}` }, { status: 400 });
    }
    const keyword = searchParams.get('keyword')?.trim() || '';

    if (!date) {
      const latest = await getLatestLhbDate();
      if (!latest) {
        return NextResponse.json({
          code: 200,
          data: { date: null, dates: [], counts: { all: 0, sh: 0, sz: 0, bj: 0 }, total: 0, list: [] },
          message: '暂无龙虎榜数据'
        });
      }
      date = toDateStr(latest);
    }

    const [{ list, counts }, dates] = await Promise.all([
      listLhbStocks({ date, market: market || undefined, keyword: keyword || undefined }),
      listLhbDates()
    ]);

    return NextResponse.json({
      code: 200,
      data: {
        date,
        dates: dates.map(toDateStr),
        counts,
        total: list.length,
        list
      },
      message: '请求成功'
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    console.error('[api/lhb] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};
