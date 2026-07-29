import prisma from '@/lib/prisma';

/* 邀请（invitations 表）：OAuth 注册白名单，admin 在设置页「用户管理」tab 维护。
   三方登录（feishu/lark/github）邮箱须命中 pending 邀请才放行；
   status pending / accepted（accepted 留档审计，不可删除）。 */

export type TInvitationItem = {
  id: string;
  email: string;
  status: string; // pending / accepted
  createdAt: Date;
  acceptedAt: Date | null;
};

// 邀请列表（最新在前）
export const listInvitations = async (): Promise<TInvitationItem[]> => {
  return prisma.invitation.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, status: true, createdAt: true, acceptedAt: true },
  });
};

export const findInvitationByEmail = async (email: string) => {
  return prisma.invitation.findUnique({ where: { email } });
};

export const findInvitationById = async (id: string) => {
  return prisma.invitation.findUnique({ where: { id } });
};

export const createInvitation = async (input: { email: string; invitedBy?: string | null }) => {
  return prisma.invitation.create({
    data: { email: input.email, invitedBy: input.invitedBy ?? null },
  });
};

export const deleteInvitation = async (id: string) => {
  return prisma.invitation.delete({ where: { id } });
};
