import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { ensureDefaultRealtimeSources, listRealtimeSources } from '@/model/RealtimeSource';

export const dynamic = 'force-dynamic';

// GET /api/stocks/manage/sources - 实时行情数据源列表（仅 admin；空表自动补默认三源）
export const GET = async () => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureDefaultRealtimeSources();
    const list = await listRealtimeSources();
    return NextResponse.json({ code: 200, data: list, message: '请求成功' });
  } catch (error) {
    console.error('[api/stocks/manage/sources] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};
