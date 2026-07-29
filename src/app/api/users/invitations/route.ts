import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { createInvitation, findInvitationByEmail, listInvitations } from '@/model/Invitation';
import { isEmail, normalizeEmail } from '@/server/user-emails';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// Prisma 唯一约束冲突（P2002）判定
const isUniqueConflict = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';

// GET /api/users/invitations - 邀请列表（仅 admin）
export const GET = async () => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const list = await listInvitations();
    return NextResponse.json({ code: 200, data: list, message: '请求成功' });
  } catch (error) {
    console.error('[api/users/invitations] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};

// POST /api/users/invitations { email } - 新增邀请（仅 admin）：
// 邮箱小写归一；已 pending / 已 accepted 均 409；记录操作人 invitedBy
export const POST = async (request: NextRequest) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    if (!isEmail(email)) {
      return NextResponse.json({ code: 400, data: null, message: '邮箱格式不正确' }, { status: 400 });
    }

    const existing = await findInvitationByEmail(email);
    if (existing?.status === 'pending') {
      return NextResponse.json({ code: 409, data: null, message: '该邮箱已在邀请列表' }, { status: 409 });
    }
    if (existing?.status === 'accepted') {
      return NextResponse.json({ code: 409, data: null, message: '该邮箱已完成注册/绑定' }, { status: 409 });
    }

    const created = await createInvitation({ email, invitedBy: auth.uid });
    return NextResponse.json({ code: 200, data: created, message: '已邀请' });
  } catch (error) {
    // 邮箱唯一约束兜底（并发重复提交）
    if (isUniqueConflict(error)) {
      return NextResponse.json({ code: 409, data: null, message: '该邮箱已在邀请列表' }, { status: 409 });
    }
    console.error('[api/users/invitations] 创建失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '创建失败' }, { status: 500 });
  }
};
