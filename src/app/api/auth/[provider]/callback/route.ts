import { NextRequest } from 'next/server';
import {
  completeOAuthLogin,
  fetchOAuthProfile,
  loginFail,
  parseProvider,
  providerConfigured,
} from '@/server/oauth';

/* GET /api/auth/<feishu|lark|github>/callback?code=...&state=...
   账号逻辑（bind / 登录 / 邀请门控 / 建号）统一在 src/server/oauth.ts 的
   completeOAuthLogin；任何异常跳 /login?error=<provider>。 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const raw = (await ctx.params).provider;
  const p = parseProvider(raw);
  if (!p || !providerConfigured(p)) return loginFail(req, raw);
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return loginFail(req, p);
  const bindMode = req.nextUrl.searchParams.get('state') === 'bind';

  try {
    const profile = await fetchOAuthProfile(p, code, req.nextUrl.origin);
    return await completeOAuthLogin(req, p, profile, bindMode);
  } catch (e) {
    console.error(`[auth/${p}] callback failed:`, e);
    return loginFail(req, p);
  }
}
