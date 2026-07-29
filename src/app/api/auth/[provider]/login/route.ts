import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { parseProvider, providerAuthorizeUrl, providerConfigured } from '@/server/oauth';

/* GET /api/auth/<feishu|lark|github>/login → 302 到 provider 授权页。
   未配置时跳回登录页并带错误提示。已登录用户进入时 state 置 'bind'，
   回调会把该 OAuth 身份绑定到当前账号（个人资料-安全 Tab 的绑定入口）。 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const raw = (await ctx.params).provider;
  const p = parseProvider(raw);
  if (!p || !providerConfigured(p)) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(raw)}`, req.url), 302);
  }
  const session = await getSession();
  return NextResponse.redirect(
    providerAuthorizeUrl(p, req.nextUrl.origin, session ? 'bind' : undefined),
    302,
  );
}
