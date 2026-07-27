import { NextRequest, NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { syncDailyStocks } from '@/lib/jobs/sync-daily';
import { syncNews } from '@/lib/jobs/sync-news';
import { runVolumeSignalJob } from '@/lib/analysis/volume-signals';
import { getLatestDailyDate } from '@/model/StockDaily';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const VALID_TYPES = ['daily', 'news', 'signals', 'all'];

// POST /api/ashare/sync?type=daily|news|signals|all - 手动触发同步任务（需登录）
// type=all 时按 daily → signals 顺序执行（信号依赖当日日线），news 独立执行
export const POST = async (request: NextRequest) => {
  try {
    // 鉴权：优先 CRON_SECRET（供外部 cron/脚本调用），其次登录 session
    const cronSecret = process.env.CRON_SECRET;
    const bearer = request.headers.get('authorization');
    const isCron = !!cronSecret && bearer === `Bearer ${cronSecret}`;
    if (!isCron) {
      try {
        await requireUser();
      } catch (e) {
        if (e instanceof UnauthorizedError) {
          return NextResponse.json(
            { code: 401, data: null, message: '未登录' },
            { status: 401 }
          );
        }
        throw e;
      }
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type')?.trim() || 'all';
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { code: 400, data: null, message: `type 仅支持 ${VALID_TYPES.join('/')}` },
        { status: 400 }
      );
    }

    const result: Record<string, unknown> = {};

    // 行情同步（daily / all）；codes=600519,000001 时只回补指定股票的历史K线（补缺/验证用）
    if (type === 'daily' || type === 'all') {
      const codesParam = searchParams.get('codes')?.trim();
      const codes = codesParam
        ? codesParam.split(',').map(c => c.trim()).filter(c => /^\d{6}$/.test(c))
        : undefined;
      result.daily = await syncDailyStocks(codes && codes.length > 0 ? { onlyBackfillCodes: codes } : undefined);
    }

    // 信号检测（signals / all）：依赖当日日线，取库中最新日线日期
    if (type === 'signals' || type === 'all') {
      const latestDate = await getLatestDailyDate();
      if (latestDate) {
        result.signals = await runVolumeSignalJob(latestDate.toISOString().slice(0, 10));
      } else {
        result.signals = { checked: 0, signaled: 0, message: '库中暂无日线数据' };
      }
    }

    // 快讯同步（news / all），与前两项相互独立
    if (type === 'news' || type === 'all') {
      result.news = await syncNews();
    }

    return NextResponse.json({
      code: 200,
      data: result,
      message: '同步完成'
    });
  } catch (error) {
    console.error('[api/ashare/sync] 同步失败:', error);
    return NextResponse.json(
      { code: 500, data: null, message: '同步任务执行失败' },
      { status: 500 }
    );
  }
};
