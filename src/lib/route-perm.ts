import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireUser, UnauthorizedError, type SessionPayload } from '@/lib/session';

/* 路由级权限（RBAC）：角色 × 治理路由 → rw / ro / hidden 三档。
   - rw     读写：可访问且可执行写操作
   - ro     只读：可查看，写操作 403
   - hidden 不可见：侧边栏隐藏入口，接口一律 403
   admin 角色恒为全量 rw（不查库）；其余角色查 role_route_permissions，
   无记录的路由落到默认档（member 有内置默认，自定义角色默认全 ro）。
   /profile、/settings 恒定可见，不纳入矩阵。 */

// 治理路由清单（key=路径，label=显示名）：权限矩阵按此渲染与校验
export const GOVERNED_ROUTES: { route: string; label: string }[] = [
  { route: '/dashboard', label: '行情总览' },
  { route: '/pool', label: '股票池' },
  { route: '/positions', label: '持仓股' },
  { route: '/ashare', label: 'A股总览' },
  { route: '/analysis', label: '放量信号' },
  { route: '/lhb', label: '龙虎榜' },
  { route: '/cron', label: '定时任务' },
  { route: '/agent', label: 'Agent 接入' },
];

export const ROUTE_LEVELS = ['rw', 'ro', 'hidden'] as const;
export type RouteLevel = (typeof ROUTE_LEVELS)[number];

// member 内置角色的默认权限（无 DB 记录时的兜底；与 scripts/seed.ts 的默认行保持一致）
const MEMBER_DEFAULT_LEVELS: Record<string, RouteLevel> = {
  '/dashboard': 'rw',
  '/pool': 'rw',
  '/positions': 'rw',
  '/ashare': 'rw',
  '/analysis': 'rw',
  '/lhb': 'rw',
  '/cron': 'hidden',
  '/agent': 'rw',
};

// admin 恒全量读写
const ALL_RW: Record<string, RouteLevel> = Object.fromEntries(
  GOVERNED_ROUTES.map((r) => [r.route, 'rw' as RouteLevel]),
);

/* 角色默认权限：member 用内置默认，其余（自定义）角色默认全部只读。 */
export function defaultRouteLevels(roleKey: string): Record<string, RouteLevel> {
  const base = roleKey === 'member' ? MEMBER_DEFAULT_LEVELS : {};
  return Object.fromEntries(GOVERNED_ROUTES.map((r) => [r.route, base[r.route] ?? ('ro' as RouteLevel)]));
}

// 进程内缓存（10s TTL）：权限矩阵保存后调 clearRouteLevelCache() 立即失效
const CACHE_TTL_MS = 10_000;
const levelCache = new Map<string, { expires: number; levels: Record<string, RouteLevel> }>();

/* 清空路由权限缓存（权限矩阵/角色变更后调用；传 roleKey 只清单个角色）。 */
export function clearRouteLevelCache(roleKey?: string) {
  if (roleKey) levelCache.delete(roleKey);
  else levelCache.clear();
}

/* 某角色对全部治理路由的权限档：admin 直接全 rw 不查库；
   其余角色 = 默认档 merge 库中配置行（非法 route/level 忽略）。 */
export async function getRouteLevels(roleKey: string): Promise<Record<string, RouteLevel>> {
  if (roleKey === 'admin') return { ...ALL_RW };

  const cached = levelCache.get(roleKey);
  if (cached && cached.expires > Date.now()) return { ...cached.levels };

  const levels = defaultRouteLevels(roleKey);
  const role = await prisma.role.findUnique({ where: { key: roleKey }, select: { id: true } });
  if (role) {
    const rows = await prisma.roleRoutePermission.findMany({ where: { roleId: role.id } });
    for (const row of rows) {
      if (row.route in levels && (ROUTE_LEVELS as readonly string[]).includes(row.level)) {
        levels[row.route] = row.level as RouteLevel;
      }
    }
  }
  levelCache.set(roleKey, { expires: Date.now() + CACHE_TTL_MS, levels });
  return { ...levels };
}

/* 路由访问门槛（仿 require-admin.ts 风格）：
   成功返回 session；失败返回对应信封的 Response（调用方 `if (x instanceof NextResponse) return x`）。
   - 未登录 → 401
   - level === 'hidden' → 403「无权限」
   - opts.write 且 level !== 'rw' → 403「只读权限，无法执行此操作」 */
export async function requireRouteAccess(
  route: string,
  opts?: { write?: boolean },
): Promise<SessionPayload | NextResponse> {
  try {
    const session = await requireUser();
    const levels = await getRouteLevels(session.role);
    // 未知路由按不可见处理（保守）
    const level = levels[route] ?? 'hidden';
    if (level === 'hidden') {
      return NextResponse.json({ code: 403, data: null, message: '无权限' }, { status: 403 });
    }
    if (opts?.write && level !== 'rw') {
      return NextResponse.json(
        { code: 403, data: null, message: '只读权限，无法执行此操作' },
        { status: 403 },
      );
    }
    return session;
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    throw e;
  }
}
