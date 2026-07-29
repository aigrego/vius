import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { providerConfigured } from '@/server/oauth';

/* GET /api/auth/session → 登录视图；未登录时 user 为 null（code 仍为 200，
   前端据此区分「未登录」与「接口异常」）。oauth 字段透出第三方登录是否已
   配置，登录页据此决定是否展示对应按钮。 */
export async function GET() {
  const oauth = {
    feishu: providerConfigured('feishu'),
    lark: providerConfigured('lark'),
    github: providerConfigured('github'),
  };

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ code: 200, data: { user: null, oauth }, message: 'ok' });
  }

  const u = await prisma.user.findUnique({ where: { id: session.uid } });
  if (!u) {
    return NextResponse.json({ code: 200, data: { user: null, oauth }, message: 'ok' });
  }

  return NextResponse.json({
    code: 200,
    data: {
      user: { username: u.username, name: u.name, role: u.role, avatarUrl: u.avatarUrl },
      oauth,
    },
    message: 'ok',
  });
}
