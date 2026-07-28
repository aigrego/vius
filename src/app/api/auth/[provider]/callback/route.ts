import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSessionCookie, getSession } from '@/lib/session';
import { fetchOAuthProfile, parseProvider, providerConfigured } from '@/server/lark';
import { upsertOAuthEmail } from '@/server/user-emails';

function loginFail(req: NextRequest, provider: string) {
  return NextResponse.redirect(new URL(`/login?error=${provider}`, req.url), 302);
}

/* username 优先取邮箱（可读、唯一），被占用则退化为 <provider>_<unionId前8>，
   再冲突（理论不会发生）追加随机后缀。 */
async function pickUsername(preferred: string | undefined, fallback: string): Promise<string> {
  for (const c of [preferred, fallback]) {
    if (!c) continue;
    const taken = await prisma.user.findUnique({ where: { username: c }, select: { id: true } });
    if (!taken) return c;
  }
  return `${fallback}_${crypto.randomUUID().slice(0, 4)}`;
}

/* GET /api/auth/<feishu|lark>/callback?code=...&state=...
   登录模式（默认）：
   1) union_id 命中 users.larkUnionId → 老用户直接登录（仅头像跟随 OAuth 刷新，
      name 只在首次建号时写入，之后不覆盖）；
   2) 否则自动建号（passwordHash '!oauth' 禁用密码登录，role 'member'）。
   → session cookie → 302 /stock。任何失败跳 /login?error=<provider>。
   绑定模式（state='bind'，来自个人资料-安全 Tab，要求当前已登录）：
   union_id 未被占用则绑到当前账号 → 302 /profile?tab=security；
   被其他账号占用跳 /profile?tab=security&error=bind。
   两种模式下，OAuth 带回的邮箱都会落 user_emails（source=provider）。 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const raw = (await ctx.params).provider;
  const p = parseProvider(raw);
  if (!p || !providerConfigured(p)) return loginFail(req, raw);
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return loginFail(req, p);
  const bindMode = req.nextUrl.searchParams.get('state') === 'bind';

  try {
    const profile = await fetchOAuthProfile(p, code);

    // —— 绑定模式：把 OAuth 身份绑到当前登录账号 ——
    if (bindMode) {
      const session = await getSession();
      if (!session) return loginFail(req, p);
      const holder = await prisma.user.findUnique({ where: { larkUnionId: profile.unionId } });
      if (holder && holder.id !== session.uid) {
        return NextResponse.redirect(new URL('/profile?tab=security&error=bind', req.url), 302);
      }
      await prisma.user.update({
        where: { id: session.uid },
        data: { larkUnionId: profile.unionId, avatarUrl: profile.avatarUrl ?? undefined },
      });
      if (profile.email) await upsertOAuthEmail(session.uid, profile.email, p);
      return NextResponse.redirect(new URL('/profile?tab=security', req.url), 302);
    }

    // —— 登录模式 ——
    let u = await prisma.user.findUnique({ where: { larkUnionId: profile.unionId } });
    if (!u) {
      const displayName =
        profile.name || `${p === 'feishu' ? '飞书' : 'Lark'}用户 ${profile.unionId.slice(0, 8)}`;
      const username = await pickUsername(profile.email, `${p}_${profile.unionId.slice(0, 8)}`);
      u = await prisma.user.create({
        data: {
          username,
          name: displayName,
          passwordHash: '!oauth',
          role: 'member',
          larkUnionId: profile.unionId,
          avatarUrl: profile.avatarUrl ?? null,
        },
      });
    } else {
      const avatarUrl = profile.avatarUrl ?? null;
      if (u.avatarUrl !== avatarUrl) {
        u = await prisma.user.update({ where: { id: u.id }, data: { avatarUrl } });
      }
    }
    if (profile.email) await upsertOAuthEmail(u.id, profile.email, p);

    const c = await createSessionCookie(u);
    const res = NextResponse.redirect(new URL('/dashboard', req.url), 302);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  } catch (e) {
    console.error(`[auth/${p}] callback failed:`, e);
    return loginFail(req, p);
  }
}
