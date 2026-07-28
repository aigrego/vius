import { NextResponse } from 'next/server';
import { JobNotFoundError, JobRunningError, triggerJob } from '@/lib/scheduler';
import { requireAdmin } from '../../require-admin';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// POST /api/cron/[id]/trigger - 手动触发一次任务（异步执行），仅 admin
// 成功返回 { runId }；任务运行中返回 409
export const POST = async (
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const runId = await triggerJob(id);
    return NextResponse.json({ code: 200, data: { runId }, message: '已触发' });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return NextResponse.json(
        { code: 404, data: null, message: error.message },
        { status: 404 },
      );
    }
    if (error instanceof JobRunningError) {
      return NextResponse.json(
        { code: 409, data: null, message: error.message },
        { status: 409 },
      );
    }
    console.error('[api/cron] 手动触发失败:', error);
    return NextResponse.json(
      { code: 500, data: null, message: '触发失败' },
      { status: 500 },
    );
  }
};
