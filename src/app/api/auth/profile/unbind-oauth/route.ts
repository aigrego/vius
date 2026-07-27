import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, UnauthorizedError } from '@/lib/session';

/* POST /api/auth/profile/unbind-oauth → 解绑飞书/Lark（清 larkUnionId）。
   未设置密码的账号（'!oauth'）拒绝解绑，防止解绑后无法登录。 */
export async function POST() {
  try {
    const session = await requireUser();
    const u = await prisma.user.findUnique({ where: { id: session.uid } });
    if (!u) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    if (!u.larkUnionId) {
      return NextResponse.json({ code: 400, data: null, message: '当前未绑定飞书/Lark' }, { status: 400 });
    }
    if (u.passwordHash === '!oauth') {
      return NextResponse.json(
        { code: 400, data: null, message: '请先设置登录密码，再解绑飞书/Lark' },
        { status: 400 },
      );
    }
    await prisma.user.update({ where: { id: u.id }, data: { larkUnionId: null } });
    return NextResponse.json({ code: 200, data: null, message: '已解绑' });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    throw e;
  }
}
