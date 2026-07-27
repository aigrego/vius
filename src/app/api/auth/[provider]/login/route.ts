import { NextRequest, NextResponse } from 'next/server';
import { parseProvider, providerAuthorizeUrl, providerConfigured } from '@/server/lark';

/* GET /api/auth/<feishu|lark>/login → 302 到 provider 授权页。
   未配置时跳回登录页并带错误提示。 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const raw = (await ctx.params).provider;
  const p = parseProvider(raw);
  if (!p || !providerConfigured(p)) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(raw)}`, req.url), 302);
  }
  return NextResponse.redirect(providerAuthorizeUrl(p, req.nextUrl.origin), 302);
}
