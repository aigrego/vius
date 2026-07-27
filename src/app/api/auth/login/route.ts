import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/password';
import { createSessionCookie } from '@/lib/session';

/* POST /api/auth/login { username, password } → session cookie + 用户信息。
   OAuth-only 账号的 passwordHash 是 '!oauth'（永远不是合法 bcrypt hash），
   明确拒绝并提示改用飞书/Lark 登录。 */
export async function POST(req: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 400, data: null, message: '请求体格式错误' }, { status: 400 });
  }
  const username = body.username?.trim();
  const password = body.password;
  if (!username || !password) {
    return NextResponse.json({ code: 400, data: null, message: '用户名和密码必填' }, { status: 400 });
  }

  const u = await prisma.user.findUnique({ where: { username } });
  if (u && u.passwordHash === '!oauth') {
    return NextResponse.json(
      { code: 401, data: null, message: '该账号未设置密码，请使用飞书/Lark 登录' },
      { status: 401 },
    );
  }
  if (!u || !(await verifyPassword(password, u.passwordHash))) {
    return NextResponse.json(
      { code: 401, data: null, message: '用户名或密码错误' },
      { status: 401 },
    );
  }

  const c = await createSessionCookie(u);
  const res = NextResponse.json({
    code: 200,
    data: { user: { username: u.username, name: u.name, role: u.role, avatarUrl: u.avatarUrl } },
    message: '登录成功',
  });
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
