import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/* POST /api/auth/logout → 清除 session cookie。 */
export async function POST() {
  const res = NextResponse.json({ code: 200, data: null, message: '已退出登录' });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
