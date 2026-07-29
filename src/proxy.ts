import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/* 路由守卫（Next 16 proxy 约定，原 middleware.ts）：只检查 vius_session cookie
   是否存在（真正的校验发生在服务端 API 内部）。/login 带 cookie 则弹回 /dashboard。
   另外统一附加安全响应头。 */
const PROTECTED_PREFIXES = ['/dashboard', '/pool', '/positions', '/ashare', '/analysis', '/lhb', '/stock', '/stock-pool'];

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function withSecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);

  if (pathname === '/login') {
    if (hasSession) {
      // proxy 的 NextResponse.redirect 对同源 URL 会发相对 Location，
      // 浏览器按当前地址解析，天然保留用户实际访问的 origin
      return withSecurityHeaders(NextResponse.redirect(new URL('/dashboard', req.url), 307));
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
