import { NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { getNewsFlashManageStats } from '@/model/NewsFlash';
import { listNewsSources } from '@/model/NewsSource';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// GET /api/news/manage/stats - 资讯管理统计（仅 admin）：
// 快讯总数 / 已关联个股 / 今日新增 / 数据源（总数与启用数）/ 最新快讯时间
export const GET = async () => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const [stats, sources] = await Promise.all([getNewsFlashManageStats(), listNewsSources()]);
    return NextResponse.json({
      code: 200,
      data: {
        total: stats.total,
        matched: stats.matched,
        todayCount: stats.todayCount,
        sourceTotal: sources.length,
        sourceActive: sources.filter(s => s.enabled).length,
        latestAt: stats.latestAt
      },
      message: '请求成功'
    });
  } catch (error) {
    console.error('[api/news/manage/stats] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};
