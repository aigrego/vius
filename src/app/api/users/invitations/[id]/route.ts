import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { deleteInvitation, findInvitationById } from '@/model/Invitation';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// DELETE /api/users/invitations/[id] - 删除邀请（仅 admin）：
// 仅 pending 可删；accepted 留档审计，拒绝删除
export const DELETE = async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const invitation = await findInvitationById(id);
    if (!invitation) {
      return NextResponse.json({ code: 404, data: null, message: '邀请不存在' }, { status: 404 });
    }
    if (invitation.status !== 'pending') {
      return NextResponse.json({ code: 400, data: null, message: '已接受的邀请不可删除' }, { status: 400 });
    }

    await deleteInvitation(id);
    return NextResponse.json({ code: 200, data: null, message: '已删除' });
  } catch (error) {
    console.error('[api/users/invitations/[id]] 删除失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '删除失败' }, { status: 500 });
  }
};
