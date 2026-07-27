import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { isEmail, normalizeEmail } from '@/server/user-emails';

function unauthorized() {
  return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
}

/* POST /api/auth/profile/emails { email } → 添加备用邮箱。
   全局查重（任一邮箱可登录，必须唯一）；用户首个邮箱自动置主。 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    let body: { email?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ code: 400, data: null, message: '请求体格式错误' }, { status: 400 });
    }
    const email = normalizeEmail(body.email ?? '');
    if (!isEmail(email)) {
      return NextResponse.json({ code: 400, data: null, message: '邮箱格式不正确' }, { status: 400 });
    }

    const taken = await prisma.userEmail.findUnique({ where: { email } });
    if (taken) {
      return NextResponse.json(
        { code: 409, data: null, message: taken.userId === session.uid ? '该邮箱已添加' : '该邮箱已被其他账号使用' },
        { status: 409 },
      );
    }

    const count = await prisma.userEmail.count({ where: { userId: session.uid } });
    await prisma.userEmail.create({
      data: { userId: session.uid, email, isPrimary: count === 0, source: 'manual' },
    });
    return NextResponse.json({ code: 200, data: null, message: '已添加' });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized();
    throw e;
  }
}

/* DELETE /api/auth/profile/emails { email } → 删除备用邮箱。主邮箱拒绝删除。 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireUser();
    let body: { email?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ code: 400, data: null, message: '请求体格式错误' }, { status: 400 });
    }
    const email = normalizeEmail(body.email ?? '');
    const record = await prisma.userEmail.findUnique({ where: { email } });
    if (!record || record.userId !== session.uid) {
      return NextResponse.json({ code: 404, data: null, message: '邮箱不存在' }, { status: 404 });
    }
    if (record.isPrimary) {
      return NextResponse.json(
        { code: 400, data: null, message: '主邮箱不能删除，请先将其他邮箱设为主邮箱' },
        { status: 400 },
      );
    }
    await prisma.userEmail.delete({ where: { id: record.id } });
    return NextResponse.json({ code: 200, data: null, message: '已删除' });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized();
    throw e;
  }
}
