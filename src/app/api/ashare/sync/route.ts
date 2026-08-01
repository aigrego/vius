import { NextRequest, NextResponse } from 'next/server';
import { requireRouteAccess } from '@/lib/route-perm';
import { syncDailyStocks, backfillDailyRange } from '@/lib/jobs/sync-daily';
import { syncNews } from '@/lib/jobs/sync-news';
import { syncLhb, syncLhbRange } from '@/lib/jobs/sync-lhb';
import { syncSnapshot } from '@/lib/jobs/sync-snapshot';
import { syncFundamentals } from '@/lib/jobs/sync-fundamentals';
import { syncPlateStocks } from '@/lib/jobs/sync-plates';
import { runVolumeSignalJob } from '@/lib/analysis/volume-signals';
import { getLatestTradeDate } from '@/model/StockTrade';
import { parseDateRange } from '@/lib/trading-days';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const VALID_TYPES = ['daily', 'news', 'signals', 'lhb', 'all', 'snapshot', 'fundamentals', 'plate-stocks'];

// 单次区间回补的最长跨度（按天/按周场景足够；防一次回补拖垮数据源）
const MAX_RANGE_DAYS = 31;

// POST /api/ashare/sync?type=daily|news|signals|lhb|snapshot|fundamentals|plate-stocks|all - 手动触发同步任务（需登录）
// type=all 时按 daily → signals 顺序执行（信号依赖当日日线），news 独立执行，lhb/snapshot/fundamentals/plate-stocks 不参与 all
// 区间回补：type=daily|lhb 时 from=YYYY-MM-DD&to=YYYY-MM-DD 按区间补缺（lhb 逐工作日，daily 只补缺漏股）
export const POST = async (request: NextRequest) => {
  try {
    // 鉴权：优先 CRON_SECRET（供外部 cron/脚本调用），其次登录 session（需 /ashare 写权限）
    const cronSecret = process.env.CRON_SECRET;
    const bearer = request.headers.get('authorization');
    const isCron = !!cronSecret && bearer === `Bearer ${cronSecret}`;
    if (!isCron) {
      const auth = await requireRouteAccess('/ashare', { write: true });
      if (auth instanceof NextResponse) return auth;
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

    // 区间参数（daily / lhb 的回补模式；其一缺/非法即 400）
    const fromParam = searchParams.get('from')?.trim() || null;
    const toParam = searchParams.get('to')?.trim() || null;
    let range: { from: string; to: string } | null = null;
    if (fromParam || toParam) {
      const parsed = parseDateRange(fromParam, toParam, MAX_RANGE_DAYS);
      if ('error' in parsed) {
        return NextResponse.json({ code: 400, data: null, message: parsed.error }, { status: 400 });
      }
      range = parsed;
    }

    // 行情同步（daily / all）；codes=600519,000001 时只回补指定股票的历史K线（补缺/验证用）；
    // from+to 时按区间回补缺漏股日线（优先级：codes > 区间 > 常规同步）
    if (type === 'daily' || type === 'all') {
      const codesParam = searchParams.get('codes')?.trim();
      const codes = codesParam
        ? codesParam.split(',').map(c => c.trim()).filter(c => /^\d{6}$/.test(c))
        : undefined;
      if (codes && codes.length > 0) {
        result.daily = await syncDailyStocks({ onlyBackfillCodes: codes });
      } else if (range) {
        result.daily = await backfillDailyRange(range.from, range.to);
      } else {
        result.daily = await syncDailyStocks();
      }
    }

    // 信号检测（signals / all）：依赖当日交易行，取库中最新交易日期
    if (type === 'signals' || type === 'all') {
      const latestDate = await getLatestTradeDate();
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

    // 龙虎榜同步（lhb）：from+to 按区间逐工作日回补；date=YYYY-MM-DD 指定单日，缺省为北京当日
    if (type === 'lhb') {
      if (range) {
        result.lhb = await syncLhbRange(range.from, range.to);
      } else {
        const dateParam = searchParams.get('date')?.trim();
        const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;
        result.lhb = await syncLhb(date);
      }
    }

    // 盘中快照（snapshot）：关注股 + 全市场当日交易行刷新
    if (type === 'snapshot') {
      result.snapshot = await syncSnapshot();
    }

    // 基本面回填（fundamentals）：市值/主营业务/盈利构成/财务指标
    if (type === 'fundamentals') {
      result.fundamentals = await syncFundamentals();
    }

    // 板块成分股（plate-stocks）：plate/plate_stock 关系刷新
    if (type === 'plate-stocks') {
      result.plateStocks = await syncPlateStocks();
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
