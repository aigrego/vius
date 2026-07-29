import prisma from '@/lib/prisma';

/* 角色（roles 表）：users.role 存角色 key；admin/member 内置不可删。
   userCount = users 中 role 等于该 key 的用户数（角色删除前置校验用）。 */

export type TRoleWithUserCount = {
  id: string;
  key: string;
  name: string;
  builtin: boolean;
  userCount: number;
};

// 角色列表（内置在前），附带各角色用户数
export const listRolesWithUserCount = async (): Promise<TRoleWithUserCount[]> => {
  const [roles, grouped] = await Promise.all([
    prisma.role.findMany({ orderBy: [{ builtin: 'desc' }, { createdAt: 'asc' }] }),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
  ]);
  const countMap = new Map(grouped.map((g) => [g.role, g._count._all]));
  return roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    builtin: r.builtin,
    userCount: countMap.get(r.key) ?? 0,
  }));
};

export const findRoleByKey = async (key: string) => {
  return prisma.role.findUnique({ where: { key } });
};

export const findRoleById = async (id: string) => {
  return prisma.role.findUnique({ where: { id } });
};

export const createRole = async (input: { key: string; name: string }) => {
  return prisma.role.create({ data: { key: input.key, name: input.name } });
};

// 重命名（key 不可改）
export const renameRole = async (id: string, name: string) => {
  return prisma.role.update({ where: { id }, data: { name } });
};

export const deleteRole = async (id: string) => {
  return prisma.role.delete({ where: { id } });
};

// 使用该角色的用户数
export const countRoleUsers = async (key: string) => {
  return prisma.user.count({ where: { role: key } });
};
