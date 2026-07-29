import { NextRequest } from 'next/server';
import {
  completeOAuthLogin,
  fetchOAuthProfile,
  loginFail,
  parseProvider,
  providerConfigured,
  publicOrigin,
} from '@/server/oauth';

/* GET /api/auth/<feishu|lark|github>/callback?code=...&state=...
   账号逻辑（bind / 登录 / 邀请门控 / 建号）统一在 src/server/oauth.ts 的
   completeOAuthLogin；任何异常跳 /login?error=<provider>。
   站内跳转的 origin 取 provider 配置的 *_REDIRECT_URI（见 oauth.ts publicOrigin），
   不依赖请求 Host（反代不透传 / Next dev 强制 localhost 场景下 Host 不可信）。 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const raw = (await ctx.params).provider;
  const p = parseProvider(raw);
  if (!p || !providerConfigured(p)) return loginFail(raw);
  const origin = publicOrigin(p);
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return loginFail(p, origin);
  const bindMode = req.nextUrl.searchParams.get('state') === 'bind';

  try {
    const profile = await fetchOAuthProfile(p, code, req.nextUrl.origin);
    return await completeOAuthLogin(p, profile, bindMode);
  } catch (e) {
    console.error(`[auth/${p}] callback failed:`, e);
    return loginFail(p, origin);
  }
}
