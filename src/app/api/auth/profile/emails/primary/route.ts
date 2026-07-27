import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { normalizeEmail } from '@/server/user-emails';

/* POST /api/auth/profile/emails/primary { email } → 设为主邮箱（事务内换主）。 */
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
    const record = await prisma.userEmail.findUnique({ where: { email } });
    if (!record || record.userId !== session.uid) {
      return NextResponse.json({ code: 404, data: null, message: '邮箱不存在' }, { status: 404 });
    }
    if (!record.isPrimary) {
      await prisma.$transaction([
        prisma.userEmail.updateMany({ where: { userId: session.uid }, data: { isPrimary: false } }),
        prisma.userEmail.update({ where: { id: record.id }, data: { isPrimary: true } }),
      ]);
    }
    return NextResponse.json({ code: 200, data: null, message: '已设为主邮箱' });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    throw e;
  }
}
