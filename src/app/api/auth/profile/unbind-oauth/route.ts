import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { providerIdColumn } from '@/server/oauth';

/* POST /api/auth/profile/unbind-oauth { provider?: 'lark' | 'github' }（缺省 'lark' 兼容旧调用）
   → 解绑对应第三方登录（清 larkUnionId / githubId；feishu 与 lark 共用 larkUnionId 列）。
   防锁死：账号无密码且另一 provider 也未绑定（解绑后将无任何登录方式）时拒绝。 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();

    // 解析 provider：空 body 按缺省 'lark' 处理
    let provider: 'lark' | 'github' = 'lark';
    try {
      const body = (await req.json()) as { provider?: unknown } | null;
      if (body?.provider === 'github') provider = 'github';
      else if (body?.provider !== undefined && body.provider !== 'lark') {
        return NextResponse.json({ code: 400, data: null, message: '不支持的 provider' }, { status: 400 });
      }
    } catch {
      // 无请求体：保持缺省
    }

    const u = await prisma.user.findUnique({ where: { id: session.uid } });
    if (!u) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }

    const col = providerIdColumn(provider);
    const label = provider === 'github' ? 'GitHub' : '飞书/Lark';
    const bound = col === 'githubId' ? !!u.githubId : !!u.larkUnionId;
    if (!bound) {
      return NextResponse.json({ code: 400, data: null, message: `当前未绑定${label}` }, { status: 400 });
    }
    // 另一 provider 的绑定状态（feishu/lark 同列，视为同一 provider）
    const otherBound = col === 'githubId' ? !!u.larkUnionId : !!u.githubId;
    if (u.passwordHash === '!oauth' && !otherBound) {
      return NextResponse.json(
        { code: 400, data: null, message: `请先设置登录密码，再解绑${label}` },
        { status: 400 },
      );
    }
    await prisma.user.update({
      where: { id: u.id },
      data: col === 'githubId' ? { githubId: null } : { larkUnionId: null },
    });
    return NextResponse.json({ code: 200, data: null, message: '已解绑' });
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    throw e;
  }
}
