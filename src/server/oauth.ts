import type { Prisma, User } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSessionCookie, getSession } from '@/lib/session';
import {
  fetchOAuthProfile as larkFetchOAuthProfile,
  providerAuthorizeUrl as larkAuthorizeUrl,
  providerConfigured as larkConfigured,
} from '@/server/lark';
import { fetchGithubProfile, githubAuthorizeUrl, githubConfigured } from '@/server/github';
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

/* 统一失败出口：跳回登录页并带错误码（登录页 ERROR_MESSAGES 透出文案）。 */
export function loginFail(req: NextRequest, provider: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${provider}`, req.url), 302);
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
async function loginWith(req: NextRequest, u: User): Promise<NextResponse> {
  const c = await createSessionCookie(u);
  const res = NextResponse.redirect(new URL('/dashboard', req.url), 302);
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
     2) 否则邮箱为硬依赖：profile 拿不到邮箱 → /login?error=noemail；
     3) 邮箱（小写）须命中 pending 邀请，否则 → /login?error=invite：
        - 邀请邮箱命中已有用户（user_emails 或 username 命中）→ 绑定 provider id；
        - 无对应用户 → 自动建号（role='member'、passwordHash='!oauth' 禁用密码登录）；
        邀请在同事务置 accepted + 回填 userId，随后签发 session → /dashboard。
   两种模式下，OAuth 带回的邮箱都会落 user_emails（source=provider）。 */
export async function completeOAuthLogin(
  req: NextRequest,
  provider: OAuthProvider,
  profile: UnifiedOAuthProfile,
  bindMode: boolean,
): Promise<NextResponse> {
  const col = providerIdColumn(provider);

  // —— 绑定模式 ——
  if (bindMode) {
    const session = await getSession();
    if (!session) return loginFail(req, provider);
    const holder = await findUserByProviderId(prisma, col, profile.providerUserId);
    if (holder && holder.id !== session.uid) {
      return NextResponse.redirect(new URL('/profile?tab=security&error=bind', req.url), 302);
    }
    await prisma.user.update({
      where: { id: session.uid },
      data: { ...providerIdData(col, profile.providerUserId), avatarUrl: profile.avatarUrl ?? undefined },
    });
    if (profile.email) await upsertOAuthEmail(session.uid, profile.email, provider);
    return NextResponse.redirect(new URL('/profile?tab=security', req.url), 302);
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
    return loginWith(req, u);
  }

  // —— 登录模式 2)+3)：邮箱硬依赖 + pending 邀请门控 ——
  const email = profile.email ? normalizeEmail(profile.email) : '';
  if (!isEmail(email)) {
    return NextResponse.redirect(new URL('/login?error=noemail', req.url), 302);
  }
  const invitation = await prisma.invitation.findUnique({ where: { email } });
  if (!invitation || invitation.status !== 'pending') {
    return NextResponse.redirect(new URL('/login?error=invite', req.url), 302);
  }

  // 建号/绑定与邀请接受放同一事务；邀请用条件更新消费，防并发重复放行。
  let user: User;
  try {
    user = await prisma.$transaction(async (tx) => {
      // 邀请邮箱命中已有用户（user_emails 或 username 为该邮箱）→ 绑定 provider id
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
      return NextResponse.redirect(new URL('/login?error=invite', req.url), 302);
    }
    throw e;
  }

  await upsertOAuthEmail(user.id, email, provider);
  return loginWith(req, user);
}
