import type { Prisma, User } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSessionCookie, getSession } from '@/lib/session';
import {
  fetchOAuthProfile as larkFetchOAuthProfile,
  providerAuthorizeUrl as larkAuthorizeUrl,
  providerConfigured as larkConfigured,
  providerRedirectUri as larkRedirectUri,
} from '@/server/lark';
import { fetchGithubProfile, githubAuthorizeUrl, githubConfigured, githubRedirectUri } from '@/server/github';
import { isEmail, normalizeEmail, upsertOAuthEmail } from '@/server/user-emails';

/* 三方 OAuth 统一门面：feishu / lark 转发 server/lark.ts，github 转发 server/github.ts；
   回调的账号逻辑（bind / 登录 / 邀请门控 / 建号）集中在 completeOAuthLogin。 */

export type OAuthProvider = 'feishu' | 'lark' | 'github';

/* 归一化后的三方资料（lark.ts 的 unionId 在此适配为 providerUserId）。 */
export interface UnifiedOAuthProfile {
  providerUserId: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export function parseProvider(raw: string): OAuthProvider | null {
  return raw === 'feishu' || raw === 'lark' || raw === 'github' ? raw : null;
}

export function providerConfigured(p: OAuthProvider): boolean {
  return p === 'github' ? githubConfigured() : larkConfigured(p);
}

export function providerAuthorizeUrl(p: OAuthProvider, origin: string, state?: string): string {
  return p === 'github' ? githubAuthorizeUrl(origin, state) : larkAuthorizeUrl(p, origin, state);
}

export async function fetchOAuthProfile(
  p: OAuthProvider,
  code: string,
  origin: string,
): Promise<UnifiedOAuthProfile> {
  if (p === 'github') return fetchGithubProfile(code, origin);
  const prof = await larkFetchOAuthProfile(p, code);
  return {
    providerUserId: prof.unionId,
    name: prof.name,
    email: prof.email,
    avatarUrl: prof.avatarUrl,
  };
}

/* provider 身份在 users 表的唯一列：feishu/lark 共用 lark_union_id，github 用 github_id。 */
export function providerIdColumn(p: OAuthProvider): 'larkUnionId' | 'githubId' {
  return p === 'github' ? 'githubId' : 'larkUnionId';
}

/* 站内跳转：给了 origin 就拼绝对地址，否则用相对 Location（浏览器按当前地址解析）。
   注意不能信 req.url 的 Host：反代不透传 Host、Next dev server 强制 localhost 的场景下，
   req.url 的主机名都不是用户浏览器里的真实地址。 */
function redirectInApp(path: string, origin?: string): NextResponse {
  return new NextResponse(null, {
    status: 302,
    headers: { Location: origin ? `${origin}${path}` : path },
  });
}

/* 用户实际访问的公开 origin：取 provider 配置的 *_REDIRECT_URI 的 origin
   （它必须是浏览器可达的地址，否则 OAuth 回调本身就到不了，天然可信）。
   env 未配置时返回 undefined，调用方退化为相对 Location。 */
export function publicOrigin(p: OAuthProvider): string | undefined {
  const uri = p === 'github' ? githubRedirectUri('') : larkRedirectUri(p, '');
  try {
    const origin = new URL(uri).origin;
    // env 未配置时 providerRedirectUri 退化为 `${origin}/api/...`，origin='' 会得到非法/空值
    return origin && origin !== 'null' ? origin : undefined;
  } catch {
    return undefined;
  }
}

/* 统一失败出口：跳回登录页并带错误码（登录页 ERROR_MESSAGES 透出文案）。 */
export function loginFail(provider: string, origin?: string): NextResponse {
  return redirectInApp(`/login?error=${provider}`, origin);
}

/* 邀请被并发消费时抛出，事务回滚后按「无邀请」处理。 */
class InvitationConsumedError extends Error {}

function providerLabel(p: OAuthProvider): string {
  return p === 'feishu' ? '飞书' : p === 'lark' ? 'Lark' : 'GitHub';
}

/* findUnique 的 where 需要静态形状，用三元展开。 */
function findUserByProviderId(
  db: Prisma.TransactionClient,
  col: 'larkUnionId' | 'githubId',
  id: string,
) {
  return db.user.findUnique({
    where: col === 'githubId' ? { githubId: id } : { larkUnionId: id },
  });
}

function providerIdData(col: 'larkUnionId' | 'githubId', value: string) {
  return col === 'githubId' ? { githubId: value } : { larkUnionId: value };
}

/* username 优先取邮箱（可读、唯一），被占用则退化为 <provider>_<id前8>，
   再冲突（理论不会发生）追加随机后缀。 */
async function pickUsername(
  db: Prisma.TransactionClient,
  preferred: string | undefined,
  fallback: string,
): Promise<string> {
  for (const c of [preferred, fallback]) {
    if (!c) continue;
    const taken = await db.user.findUnique({ where: { username: c }, select: { id: true } });
    if (!taken) return c;
  }
  return `${fallback}_${crypto.randomUUID().slice(0, 4)}`;
}

/* 签发 session cookie 并 302 到 /dashboard。 */
async function loginWith(u: User, origin?: string): Promise<NextResponse> {
  const c = await createSessionCookie(u);
  const res = redirectInApp('/dashboard', origin);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}

/* 完成 OAuth 回调的账号逻辑，返回 302 响应。
   绑定模式（bindMode=true，已登录用户从 个人资料-安全 发起，state='bind'）：
     provider id 未被占用则绑到当前账号 → /profile?tab=security；
     被其他账号占用 → /profile?tab=security&error=bind。不看邀请。
   登录模式（邀请门控，按序判定）：
     1) provider id 已绑定在某账号 → 直接登录（历史授权，不看邀请；
        仅头像跟随 OAuth 刷新，name 只在首次建号时写入）；
     2) 邮箱为硬依赖：profile 拿不到邮箱 → /login?error=noemail；
     3) 邮箱（小写）命中已有用户的任一邮箱（user_emails 或 username 命中）→
        免邀请绑定 provider id 并登录（多邮箱账号的任一邮箱都参与三方登录匹配）；
     4) 全新邮箱须命中 pending 邀请，否则 → /login?error=invite：
        自动建号（role='member'、passwordHash='!oauth' 禁用密码登录；边缘时序下
        邮箱刚被并入某账号则退化为绑定），邀请同事务置 accepted + 回填 userId，
        随后签发 session → /dashboard。
   两种模式下，OAuth 带回的邮箱都会落 user_emails（source=provider）。 */
export async function completeOAuthLogin(
  provider: OAuthProvider,
  profile: UnifiedOAuthProfile,
  bindMode: boolean,
): Promise<NextResponse> {
  const col = providerIdColumn(provider);
  // 登录后跳转的公开 origin（provider *_REDIRECT_URI 的 origin），取不到则相对 Location
  const origin = publicOrigin(provider);

  // —— 绑定模式 ——
  if (bindMode) {
    const session = await getSession();
    if (!session) return loginFail(provider, origin);
    const holder = await findUserByProviderId(prisma, col, profile.providerUserId);
    if (holder && holder.id !== session.uid) {
      return redirectInApp('/profile?tab=security&error=bind', origin);
    }
    await prisma.user.update({
      where: { id: session.uid },
      data: { ...providerIdData(col, profile.providerUserId), avatarUrl: profile.avatarUrl ?? undefined },
    });
    if (profile.email) await upsertOAuthEmail(session.uid, profile.email, provider);
    return redirectInApp('/profile?tab=security', origin);
  }

  // —— 登录模式 1)：provider id 已绑定 → 直接登录 ——
  const bound = await findUserByProviderId(prisma, col, profile.providerUserId);
  if (bound) {
    const avatarUrl = profile.avatarUrl ?? null;
    const u =
      bound.avatarUrl !== avatarUrl
        ? await prisma.user.update({ where: { id: bound.id }, data: { avatarUrl } })
        : bound;
    if (profile.email) await upsertOAuthEmail(u.id, profile.email, provider);
    return loginWith(u, origin);
  }

  // —— 登录模式 2)：邮箱硬依赖 ——
  const email = profile.email ? normalizeEmail(profile.email) : '';
  if (!isEmail(email)) {
    return redirectInApp('/login?error=noemail', origin);
  }

  // —— 登录模式 3)：邮箱命中已有用户的任一邮箱 → 免邀请绑定登录 ——
  // 多邮箱账号的任一邮箱（user_emails 或 username 命中）都参与三方登录匹配；邀请只门控全新邮箱
  const emailRow = await prisma.userEmail.findUnique({ where: { email } });
  const owner = emailRow
    ? await prisma.user.findUnique({ where: { id: emailRow.userId } })
    : await prisma.user.findUnique({ where: { username: email } });
  if (owner) {
    const u = await prisma.user.update({
      where: { id: owner.id },
      data: {
        ...providerIdData(col, profile.providerUserId),
        avatarUrl: profile.avatarUrl ?? undefined,
      },
    });
    await upsertOAuthEmail(u.id, email, provider);
    return loginWith(u, origin);
  }

  // —— 登录模式 4)：全新邮箱须命中 pending 邀请 ——
  const invitation = await prisma.invitation.findUnique({ where: { email } });
  if (!invitation || invitation.status !== 'pending') {
    return redirectInApp('/login?error=invite', origin);
  }

  // 建号/绑定与邀请接受放同一事务；邀请用条件更新消费，防并发重复放行。
  let user: User;
  try {
    user = await prisma.$transaction(async (tx) => {
      // 边缘时序：邀请创建后邮箱刚被并入某账号（user_emails 或 username 为该邮箱）→ 退化为绑定 provider id
      const emailRow = await tx.userEmail.findUnique({ where: { email } });
      const target = emailRow
        ? await tx.user.findUnique({ where: { id: emailRow.userId } })
        : await tx.user.findUnique({ where: { username: email } });

      let u: User;
      if (target) {
        u = await tx.user.update({
          where: { id: target.id },
          data: {
            ...providerIdData(col, profile.providerUserId),
            avatarUrl: profile.avatarUrl ?? undefined,
          },
        });
      } else {
        const displayName =
          profile.name || `${providerLabel(provider)}用户 ${profile.providerUserId.slice(0, 8)}`;
        const username = await pickUsername(tx, email, `${provider}_${profile.providerUserId.slice(0, 8)}`);
        u = await tx.user.create({
          data: {
            username,
            name: displayName,
            passwordHash: '!oauth',
            role: 'member',
            ...providerIdData(col, profile.providerUserId),
            avatarUrl: profile.avatarUrl ?? null,
          },
        });
      }

      const consumed = await tx.invitation.updateMany({
        where: { id: invitation.id, status: 'pending' },
        data: { status: 'accepted', userId: u.id, acceptedAt: new Date() },
      });
      if (consumed.count === 0) throw new InvitationConsumedError();
      return u;
    });
  } catch (e) {
    if (e instanceof InvitationConsumedError) {
      return redirectInApp('/login?error=invite', origin);
    }
    throw e;
  }

  await upsertOAuthEmail(user.id, email, provider);
  return loginWith(user, origin);
}
