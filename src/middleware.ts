import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/* 路由守卫：只检查 vius_session cookie 是否存在（真正的校验发生在服务端
   API 内部）。/login 带 cookie 则弹回 /stock。另外统一附加安全响应头。 */
const PROTECTED_PREFIXES = ['/stock', '/stock-pool'];

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function withSecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);

  if (pathname === '/login') {
    if (hasSession) {
      return withSecurityHeaders(NextResponse.redirect(new URL('/stock', req.url), 307));
    }
    return withSecurityHeaders(NextResponse.next());
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !hasSession) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/login', req.url), 307));
  }
  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    // 排除静态资源与图片优化路径
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
