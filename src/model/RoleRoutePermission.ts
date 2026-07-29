import type { Prisma } from '@prisma/client';

/* 角色-路由权限（role_route_permissions 表）：权限矩阵的落库读写。
   只存显式配置过的行；未配置的路由由 src/lib/route-perm.ts 的默认档兜底。 */

// 覆盖式写入某角色的治理路由权限：先删旧行再批量插入（须在交互式事务内调用）
export const replaceRolePermsInTx = async (
  tx: Prisma.TransactionClient,
  roleId: string,
  rows: { route: string; level: string }[],
) => {
  await tx.roleRoutePermission.deleteMany({ where: { roleId } });
  if (rows.length > 0) {
    await tx.roleRoutePermission.createMany({
      data: rows.map((r) => ({ roleId, route: r.route, level: r.level })),
    });
  }
};
