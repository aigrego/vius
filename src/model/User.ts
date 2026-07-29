import prisma from '@/lib/prisma';

/* 用户管理（users 表）：admin 在设置页「用户管理」tab 维护。
   关联数据处理：user_emails / watchlist / position 均为级联删除（schema onDelete: Cascade），
   alert_history.user_id 无外键（可空），删除用户时置空保留历史。 */

export type TAdminUserItem = {
  id: string;
  username: string;
  name: string | null;
  role: string;
  createdAt: Date;
  primaryEmail: string | null;
};

// 用户列表（主邮箱优先、无则任取一个邮箱）
export const listUsers = async (): Promise<TAdminUserItem[]> => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      emails: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
      },
    },
  });
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt,
    primaryEmail: u.emails[0]?.email ?? null,
  }));
};

export const findUserByUsername = async (username: string) => {
  return prisma.user.findUnique({ where: { username } });
};

export const findUserById = async (id: string) => {
  return prisma.user.findUnique({ where: { id } });
};

export const createUser = async (input: {
  username: string;
  passwordHash: string;
  role: string;
  name?: string | null;
}) => {
  return prisma.user.create({
    data: {
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role,
      name: input.name ?? null,
    },
  });
};

export const updateUser = async (
  id: string,
  input: { role?: string; name?: string | null; passwordHash?: string },
) => {
  return prisma.user.update({ where: { id }, data: input });
};

/* 删除用户及其关联数据（事务）：
   显式删除邮箱/股票池/持仓（schema 已级联，双保险），alert_history.userId 置空保留历史。 */
export const deleteUserWithRelations = async (id: string) => {
  return prisma.$transaction([
    prisma.userEmail.deleteMany({ where: { userId: id } }),
    prisma.watchlist.deleteMany({ where: { userId: id } }),
    prisma.position.deleteMany({ where: { userId: id } }),
    prisma.alertHistory.updateMany({ where: { userId: id }, data: { userId: null } }),
    prisma.user.delete({ where: { id } }),
  ]);
};
