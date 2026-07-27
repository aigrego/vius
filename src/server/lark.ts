import { env } from '@/lib/env';

/* 飞书（CN）/ Lark（国际版）OAuth 助手。两个产品跑在不同的开放平台
   （open.feishu.cn vs open.larksuite.com），需要分别建应用；每个 provider
   仅在对应 *_APP_ID / *_APP_SECRET 环境变量配置时启用。redirect URI 默认
   <origin>/api/auth/<provider>/callback，可被 <PROVIDER>_REDIRECT_URI 覆盖。 */

export type OAuthProvider = 'feishu' | 'lark';

interface ProviderConf {
  apiBase: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
}

const PROVIDERS: Record<OAuthProvider, ProviderConf> = {
  feishu: {
    apiBase: 'https://open.feishu.cn',
    appId: env.feishuAppId,
    appSecret: env.feishuAppSecret,
    redirectUri: env.feishuRedirectUri,
  },
  lark: {
    apiBase: 'https://open.larksuite.com',
    appId: env.larkAppId,
    appSecret: env.larkAppSecret,
    redirectUri: env.larkRedirectUri,
  },
};

export function parseProvider(raw: string): OAuthProvider | null {
  return raw === 'feishu' || raw === 'lark' ? raw : null;
}

export function providerConfigured(p: OAuthProvider): boolean {
  return !!(PROVIDERS[p].appId && PROVIDERS[p].appSecret);
}

export function providerRedirectUri(p: OAuthProvider, origin: string): string {
  return PROVIDERS[p].redirectUri || `${origin}/api/auth/${p}/callback`;
}

/* 浏览器 302 跳转过去的授权 URL。登录流程使用一次性随机 state，
   不做跨请求 state 校验（单租户工具）。 */
export function providerAuthorizeUrl(p: OAuthProvider, origin: string, state?: string): string {
  const redirect = encodeURIComponent(providerRedirectUri(p, origin));
  return `${PROVIDERS[p].apiBase}/open-apis/authen/v1/authorize?app_id=${PROVIDERS[p].appId}&redirect_uri=${redirect}&state=${state ?? crypto.randomUUID()}`;
}

export interface OAuthProfile {
  unionId: string;
  name: string;
  // user_info 的 email / enterprise_email 字段需要应用开通对应 scope 并重新
  // 发布后才返回；拿不到时为 undefined。
  email?: string;
  // 头像（avatar_big 优先）；user_info 基础字段，无需额外 scope。
  avatarUrl?: string;
}

/* authorization code → app_access_token → user_access_token → user_info。
   union_id 是跨应用稳定身份。任何一步失败都抛错。 */
export async function fetchOAuthProfile(p: OAuthProvider, code: string): Promise<OAuthProfile> {
  const conf = PROVIDERS[p];

  // 1) app_access_token —— 应用级凭证。
  const appTokRes = await fetch(`${conf.apiBase}/open-apis/auth/v3/app_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: conf.appId, app_secret: conf.appSecret }),
    signal: AbortSignal.timeout(10_000),
  });
  const appTok = (await appTokRes.json()) as { code?: number; app_access_token?: string };
  if (appTok.code !== 0 || !appTok.app_access_token) {
    throw new Error(`app_access_token failed (code=${appTok.code})`);
  }

  // 2) authorization code → user_access_token。
  const userTokRes = await fetch(`${conf.apiBase}/open-apis/authen/v1/oidc/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${appTok.app_access_token}`,
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
    signal: AbortSignal.timeout(10_000),
  });
  const userTok = (await userTokRes.json()) as { code?: number; data?: { access_token?: string } };
  const userAccessToken = userTok.data?.access_token;
  if (userTok.code !== 0 || !userAccessToken) {
    throw new Error(`oidc access_token failed (code=${userTok.code})`);
  }

  // 3) 用户资料。
  const infoRes = await fetch(`${conf.apiBase}/open-apis/authen/v1/user_info`, {
    headers: { Authorization: `Bearer ${userAccessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  const info = (await infoRes.json()) as {
    code?: number;
    data?: {
      union_id?: string;
      name?: string;
      email?: string;
      enterprise_email?: string;
      avatar_url?: string;
      avatar_middle?: string;
      avatar_big?: string;
    };
  };
  const unionId = info.data?.union_id;
  if (info.code !== 0 || !unionId) throw new Error(`user_info failed (code=${info.code})`);
  return {
    unionId,
    name: info.data?.name?.trim() || '',
    email: info.data?.email?.trim() || info.data?.enterprise_email?.trim() || undefined,
    avatarUrl: info.data?.avatar_big || info.data?.avatar_middle || info.data?.avatar_url || undefined,
  };
}
