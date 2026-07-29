import { handleApiError } from '@/utils/api-response';
import { NextResponse } from 'next/server';
import { getAshareStats } from '@/model/Stats';
import { requireRouteAccess } from '@/lib/route-perm';

// 声明为动态路由：统计数据实时查询，避免构建期静态化/缓存
export const dynamic = 'force-dynamic';

// GET /api/ashare/stats - A 股数据总览统计
export const GET = async () => {
  try {
    // 路由权限：/ashare 为 hidden 时 403
    const auth = await requireRouteAccess('/ashare');
    if (auth instanceof NextResponse) return auth;

    const stats = await getAshareStats();

    return NextResponse.json({
      code: 200,
      data: stats,
      message: '请求成功'
    });
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 });
  }
};
