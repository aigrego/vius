import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/app/api/cron/require-admin';
import {
  GOVERNED_ROUTES,
  ROUTE_LEVELS,
  clearRouteLevelCache,
  getRouteLevels,
  type RouteLevel,
} from '@/lib/route-perm';
import { replaceRolePermsInTx } from '@/model/RoleRoutePermission';

// 声明为动态路由
export const dynamic = 'force-dynamic';

/* GET /api/permissions - 权限矩阵（仅 admin）：
   routes = 治理路由清单；roles = 非 admin 角色；matrix = 各角色完整权限档（含默认档补齐）。 */
export const GET = async () => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    // admin 恒全 rw，不进矩阵
    const roles = await prisma.role.findMany({
      where: { key: { not: 'admin' } },
      orderBy: [{ builtin: 'desc' }, { createdAt: 'asc' }],
      select: { key: true, name: true },
    });
    const matrix: Record<string, Record<string, RouteLevel>> = {};
    for (const role of roles) {
      matrix[role.key] = await getRouteLevels(role.key);
    }
    return NextResponse.json({
      code: 200,
      data: { routes: GOVERNED_ROUTES, roles, matrix },
      message: '请求成功',
    });
  } catch (error) {
    console.error('[api/permissions] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};

/* PUT /api/permissions - 保存权限矩阵（仅 admin）：
   body { matrix: { roleKey: { route: level } } }；对每个角色覆盖式重写治理路由权限行。 */
export const PUT = async (request: NextRequest) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => null);
    const matrix = body?.matrix;
    if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
      return NextResponse.json({ code: 400, data: null, message: 'matrix 格式不正确' }, { status: 400 });
    }

    const validRoutes = new Set(GOVERNED_ROUTES.map((r) => r.route));
    const validLevels = new Set<string>(ROUTE_LEVELS);

    // 逐角色校验：角色存在且非 admin、route/level 合法
    const entries = Object.entries(matrix as Record<string, unknown>);
    const plans: { roleId: string; rows: { route: string; level: string }[] }[] = [];
    for (const [roleKey, permsRaw] of entries) {
      if (roleKey === 'admin') {
        return NextResponse.json(
          { code: 400, data: null, message: 'admin 角色恒为全部权限，不可配置' },
          { status: 400 },
        );
      }
      const role = await prisma.role.findUnique({ where: { key: roleKey }, select: { id: true } });
      if (!role) {
        return NextResponse.json(
          { code: 400, data: null, message: `角色不存在：${roleKey}` },
          { status: 400 },
        );
      }
      if (!permsRaw || typeof permsRaw !== 'object' || Array.isArray(permsRaw)) {
        return NextResponse.json(
          { code: 400, data: null, message: `角色 ${roleKey} 的权限格式不正确` },
          { status: 400 },
        );
      }
      const rows: { route: string; level: string }[] = [];
      for (const [route, level] of Object.entries(permsRaw as Record<string, unknown>)) {
        if (!validRoutes.has(route)) {
          return NextResponse.json(
            { code: 400, data: null, message: `未知路由：${route}` },
            { status: 400 },
          );
        }
        if (typeof level !== 'string' || !validLevels.has(level)) {
          return NextResponse.json(
            { code: 400, data: null, message: `非法权限档：${String(level)}（仅 rw/ro/hidden）` },
            { status: 400 },
          );
        }
        rows.push({ route, level });
      }
      plans.push({ roleId: role.id, rows });
    }

    // 事务内对每个角色 deleteMany 旧行 + createMany 新行
    await prisma.$transaction(async (tx) => {
      for (const plan of plans) {
        await replaceRolePermsInTx(tx, plan.roleId, plan.rows);
      }
    });

    // 立即失效进程内缓存，下次请求读到新矩阵
    clearRouteLevelCache();
    return NextResponse.json({ code: 200, data: null, message: '已保存' });
  } catch (error) {
    console.error('[api/permissions] 保存失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '保存失败' }, { status: 500 });
  }
};
