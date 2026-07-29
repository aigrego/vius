import { env } from '@/lib/env';

/* GitHub OAuth 助手（OAuth App，https://github.com/settings/developers 创建）。
   仅在 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET 配置时启用。redirect URI 默认
   <origin>/api/auth/github/callback，可被 GITHUB_REDIRECT_URI 覆盖。 */

export function githubConfigured(): boolean {
  return !!(env.githubClientId && env.githubClientSecret);
}

export function githubRedirectUri(origin: string): string {
  return env.githubRedirectUri || `${origin}/api/auth/github/callback`;
}

/* 浏览器 302 跳转过去的授权 URL。scope 只要 read:user + user:email（公开资料 + 邮箱）。
   登录流程使用一次性随机 state，不做跨请求 state 校验（单租户工具）。 */
export function githubAuthorizeUrl(origin: string, state?: string): string {
  const redirect = encodeURIComponent(githubRedirectUri(origin));
  const scope = encodeURIComponent('read:user user:email');
  return `https://github.com/login/oauth/authorize?client_id=${env.githubClientId}&redirect_uri=${redirect}&scope=${scope}&state=${state ?? crypto.randomUUID()}`;
}

export interface GithubProfile {
  providerUserId: string; // GitHub 数字 id 转字符串（跨应用稳定身份）
  name: string; // name 为空时退化 login
  email?: string; // primary && verified 优先；拿不到为 undefined
  avatarUrl?: string;
}

/* authorization code → access_token → GET /user → GET /user/emails。
   任何一步失败都抛错（回调统一跳 /login?error=github）。 */
export async function fetchGithubProfile(code: string, origin: string): Promise<GithubProfile> {
  // 1) code → access_token。必须带 Accept: application/json，否则返回 form 编码；
  //    失败时 GitHub 仍返回 200，错误在 body 的 error 字段。
  const tokRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      code,
      redirect_uri: githubRedirectUri(origin),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokRes.ok) throw new Error(`github access_token failed (status=${tokRes.status})`);
  const tok = (await tokRes.json()) as { access_token?: string; error?: string };
  if (!tok.access_token) throw new Error(`github access_token failed (${tok.error ?? 'unknown'})`);

  const headers = {
    Authorization: `Bearer ${tok.access_token}`,
    Accept: 'application/vnd.github+json',
  };

  // 2) 用户资料（id / login / name / avatar_url；email 字段用户隐藏邮箱时为 null）。
  const userRes = await fetch('https://api.github.com/user', {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!userRes.ok) throw new Error(`github /user failed (status=${userRes.status})`);
  const user = (await userRes.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    avatar_url?: string;
  };
  if (!user.id || !user.login) throw new Error('github /user missing id/login');

  // 3) 邮箱走 /user/emails：取 primary && verified，退化第一个 verified，再退化 undefined。
  const emailsRes = await fetch('https://api.github.com/user/emails', {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!emailsRes.ok) throw new Error(`github /user/emails failed (status=${emailsRes.status})`);
  const emailList = (await emailsRes.json()) as { email?: string; primary?: boolean; verified?: boolean }[];
  const verified = Array.isArray(emailList) ? emailList.filter((e) => e.verified && e.email) : [];
  const email = verified.find((e) => e.primary)?.email ?? verified[0]?.email;

  return {
    providerUserId: String(user.id),
    name: user.name?.trim() || user.login,
    email,
    avatarUrl: user.avatar_url || undefined,
  };
}
