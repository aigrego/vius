import { NextResponse } from 'next/server';
import { listJobs } from '@/lib/scheduler';
import { requireAdmin } from './require-admin';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// GET /api/cron - 定时任务清单（注册表 + 生效配置 + 最近运行记录），仅 admin
export const GET = async () => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const jobs = await listJobs();
    return NextResponse.json({ code: 200, data: jobs, message: 'ok' });
  } catch (error) {
    console.error('[api/cron] 查询任务清单失败:', error);
    return NextResponse.json(
      { code: 500, data: null, message: '查询任务清单失败' },
      { status: 500 },
    );
  }
};
