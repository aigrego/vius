import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { hashPassword, verifyPassword } from '@/lib/password';

/* POST /api/auth/profile/password { oldPassword, newPassword } → 修改密码。
   OAuth-only 账号（passwordHash '!oauth'）视为「设置密码」，免旧密码。 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    let body: { oldPassword?: string; newPassword?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ code: 400, data: null, message: '请求体格式错误' }, { status: 400 });
    }
    const newPassword = body.newPassword;
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ code: 400, data: null, message: '新密码至少 6 位' }, { status: 400 });
    }

    const u = await prisma.user.findUnique({ where: { id: session.uid } });
    if (!u) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }

    if (u.passwordHash !== '!oauth') {
      if (!body.oldPassword || !(await verifyPassword(body.oldPassword, u.passwordHash))) {
        return NextResponse.json({ code: 400, data: null, message: '旧密码错误' }, { status: 400 });
      }
    }

    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    return NextResponse.json({ code: 200, data: null, message: '密码已更新' });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    throw e;
  }
}
