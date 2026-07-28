import { NextRequest, NextResponse } from 'next/server';
import {
  InvalidCronError,
  JobNotFoundError,
  listJobs,
  rescheduleJob,
} from '@/lib/scheduler';
import { requireAdmin } from '../require-admin';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// PUT /api/cron/[id] - 修改任务配置（cron 表达式 / 启用开关），仅 admin
// body: { cron?: string, enabled?: boolean }，未传字段保持当前生效值
export const PUT = async (
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;

    const body = (await request.json().catch(() => null)) as {
      cron?: unknown;
      enabled?: unknown;
    } | null;
    if (!body || (body.cron === undefined && body.enabled === undefined)) {
      return NextResponse.json(
        { code: 400, data: null, message: 'body 需至少包含 cron 或 enabled' },
        { status: 400 },
      );
    }
    if (body.cron !== undefined && typeof body.cron !== 'string') {
      return NextResponse.json(
        { code: 400, data: null, message: 'cron 必须是字符串' },
        { status: 400 },
      );
    }
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { code: 400, data: null, message: 'enabled 必须是布尔值' },
        { status: 400 },
      );
    }

    // 取当前生效配置做字段合并；id 不存在在此返回 404
    const jobs = await listJobs();
    const current = jobs.find((j) => j.id === id);
    if (!current) {
      return NextResponse.json(
        { code: 404, data: null, message: `任务不存在: ${id}` },
        { status: 404 },
      );
    }

    const cronExpr = (body.cron as string | undefined)?.trim() || current.cron;
    const enabled = (body.enabled as boolean | undefined) ?? current.enabled;
    await rescheduleJob(id, cronExpr, enabled);

    // 返回该 job 最新状态
    const updated = (await listJobs()).find((j) => j.id === id) ?? null;
    return NextResponse.json({ code: 200, data: updated, message: '已保存' });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return NextResponse.json(
        { code: 404, data: null, message: error.message },
        { status: 404 },
      );
    }
    if (error instanceof InvalidCronError) {
      return NextResponse.json(
        { code: 400, data: null, message: error.message },
        { status: 400 },
      );
    }
    console.error('[api/cron] 修改任务配置失败:', error);
    return NextResponse.json(
      { code: 500, data: null, message: '保存失败' },
      { status: 500 },
    );
  }
};
