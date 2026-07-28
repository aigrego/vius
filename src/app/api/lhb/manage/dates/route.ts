import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { deleteLhbDay } from '@/model/Lhb';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// DELETE /api/lhb/manage/dates?date=YYYY-MM-DD - 删除某日全部龙虎榜数据（仅 admin，不可恢复）
export const DELETE = async (request: NextRequest) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const date = request.nextUrl.searchParams.get('date')?.trim() || '';
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ code: 400, data: null, message: 'date 格式应为 YYYY-MM-DD' }, { status: 400 });
    }
    await deleteLhbDay(date);
    return NextResponse.json({ code: 200, data: { date }, message: '已删除' });
  } catch (error) {
    console.error('[api/lhb/manage/dates] 删除失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '删除失败' }, { status: 500 });
  }
};
