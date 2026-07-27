import { NextResponse } from 'next/server';
import { runAlertCheck } from '@/lib/jobs/check-alerts';

// GET /api/alerts/check - 检查预警（核心逻辑已抽至 @/lib/jobs/check-alerts，供路由与定时任务复用）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const noFeishu = searchParams.get('nofeishu') === 'true';

    const result = await runAlertCheck({ force, noFeishu });

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
