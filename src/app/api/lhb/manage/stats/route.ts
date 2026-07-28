import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { getLhbStats, listLhbDates } from '@/model/Lhb';
import { listLhbSources } from '@/model/LhbSource';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// GET /api/lhb/manage/stats - 龙虎榜管理统计（仅 admin）：
// 交易日数 / 个股记录 / 席位明细 / 数据源（总数与启用数）/ 最新日期 / 已有数据日期列表
export const GET = async () => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const [stats, dates, sources] = await Promise.all([getLhbStats(), listLhbDates(), listLhbSources()]);
    return NextResponse.json({
      code: 200,
      data: {
        tradeDays: stats.tradeDays,
        stockCount: stats.stockCount,
        seatCount: stats.seatCount,
        sourceTotal: sources.length,
        sourceActive: sources.filter(s => s.enabled).length,
        latestDate: stats.latestDate ? stats.latestDate.toISOString().slice(0, 10) : null,
        dates: dates.map(d => d.toISOString().slice(0, 10))
      },
      message: '请求成功'
    });
  } catch (error) {
    console.error('[api/lhb/manage/stats] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};
