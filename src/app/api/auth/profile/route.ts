import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { backfillPrimaryEmail } from '@/server/user-emails';

function unauthorized() {
  return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
}

/* GET /api/auth/profile → 个人资料页数据：用户基本信息 + 邮箱列表。
   hasPassword / oauthBound / githubBound 供安全 Tab 决定改密表单与绑定区展示。 */
export async function GET() {
  try {
    const session = await requireUser();
    const u = await prisma.user.findUnique({ where: { id: session.uid } });
    if (!u) return unauthorized();

    // 老用户首次进资料页：username 是邮箱时惰性回填主邮箱
    await backfillPrimaryEmail(u);
    const emails = await prisma.userEmail.findMany({
      where: { userId: u.id },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return NextResponse.json({
      code: 200,
      data: {
        user: {
          username: u.username,
          name: u.name,
          role: u.role,
          avatarUrl: u.avatarUrl,
          hasPassword: u.passwordHash !== '!oauth',
          oauthBound: !!u.larkUnionId,
          githubBound: !!u.githubId,
        },
        emails: emails.map((e) => ({ email: e.email, isPrimary: e.isPrimary, source: e.source })),
      },
      message: 'ok',
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized();
    throw e;
  }
}

/* PATCH /api/auth/profile { name } → 更新姓名（空串清除为 null）。 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireUser();
    let body: { name?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ code: 400, data: null, message: '请求体格式错误' }, { status: 400 });
    }
    const name = body.name?.trim() ?? '';
    if (name.length > 50) {
      return NextResponse.json({ code: 400, data: null, message: '姓名最长 50 个字符' }, { status: 400 });
    }
    await prisma.user.update({ where: { id: session.uid }, data: { name: name || null } });
    return NextResponse.json({ code: 200, data: { name: name || null }, message: '已保存' });
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorized();
    throw e;
  }
}
