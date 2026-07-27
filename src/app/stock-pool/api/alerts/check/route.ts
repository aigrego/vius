import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { runAlertCheck } from '@/lib/jobs/check-alerts';

// GET /api/alerts/check - 手动检查当前用户股票池的预警（按账号隔离；
// 核心逻辑已抽至 @/lib/jobs/check-alerts，定时任务走 runAlertCheckAll 按用户分组）
export async function GET(request: Request) {
  try {
    let session;
    try {
      session = await requireUser();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return NextResponse.json(
          { success: false, error: '未登录' },
          { status: 401 }
        );
      }
      throw e;
    }

    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const noFeishu = searchParams.get('nofeishu') === 'true';

    const result = await runAlertCheck({
      force,
      noFeishu,
      userId: session.uid,
      username: session.username
    });

    return NextResponse.json({
      success: true,
      data: {
        alertsFound: result.triggered,
        alertsSaved: result.saved,
        alertsSkipped: result.skipped,
        alerts: result.alerts,
        feishuSent: result.feishuSent,
        force
      }
    });

  } catch (error) {
    console.error('Alert check error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check alerts' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
