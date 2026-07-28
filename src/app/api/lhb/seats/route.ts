import { NextRequest, NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { listLhbSeats } from '@/model/Lhb';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/lhb/seats?code=&date= - 某股某日龙虎榜席位明细（买入前五/卖出前五）
export const GET = async (request: NextRequest) => {
  try {
    await requireUser();

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code')?.trim() || '';
    const date = searchParams.get('date')?.trim() || '';
    if (!code || !DATE_RE.test(date)) {
      return NextResponse.json({ code: 400, data: null, message: 'code 与 date（YYYY-MM-DD）必填' }, { status: 400 });
    }

    const data = await listLhbSeats(code, date);
    return NextResponse.json({ code: 200, data, message: '请求成功' });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    console.error('[api/lhb/seats] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};
