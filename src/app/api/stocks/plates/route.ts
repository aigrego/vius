import { NextRequest, NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { getPlateCache, type PlateKind } from '@/model/PlateCache';
import { refreshPlateKind } from '@/lib/jobs/sync-plates';

// 声明为动态路由
export const dynamic = 'force-dynamic';

/* 板块行情（行情总览页右侧卡片）：行业/题材/涨幅榜/跌幅榜。
   数据一律读 plate_cache（sync-plates 定时任务交易时段每分钟预热）；
   缓存缺失时冷启动回源一次写库。响应保持各源原始形状：
   - qq_hy/qq_gn：腾讯上游原样 {code:0, data:{rank_list:[...]}}
   - xgb_rise/xgb_fall：{data:[...plates]}（已排序） */
const VALID_KINDS: PlateKind[] = ['qq_hy', 'qq_gn', 'xgb_rise', 'xgb_fall'];

export const GET = async (request: NextRequest) => {
  try {
    await requireUser();

    const kind = request.nextUrl.searchParams.get('kind') as PlateKind | null;
    if (!kind || !VALID_KINDS.includes(kind)) {
      return NextResponse.json(
        { code: 400, data: null, message: `kind 仅支持 ${VALID_KINDS.join('/')}` },
        { status: 400 }
      );
    }

    let cache = await getPlateCache(kind);
    if (!cache) {
      // 冷启动：首次访问直接回源写库
      const payload = await refreshPlateKind(kind);
      cache = { payload, updatedAt: new Date() };
    }

    const parsed = JSON.parse(cache.payload);
    const body = kind.startsWith('xgb_') ? { data: parsed } : parsed;
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    console.error('[api/stocks/plates] 获取失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '板块行情获取失败' }, { status: 502 });
  }
};
