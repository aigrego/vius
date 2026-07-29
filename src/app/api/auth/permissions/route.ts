import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { getRouteLevels } from '@/lib/route-perm';

// 声明为动态路由
export const dynamic = 'force-dynamic';

/* GET /api/auth/permissions - 当前登录用户的路由权限（登录即可）：
   侧边栏/AuthGate 据此隐藏入口与拦截隐藏路由；admin 恒全 rw。 */
export const GET = async () => {
  try {
    const session = await requireUser();
    const levels = await getRouteLevels(session.role);
    return NextResponse.json({
      code: 200,
      data: { role: session.role, levels },
      message: '请求成功',
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    console.error('[api/auth/permissions] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};
