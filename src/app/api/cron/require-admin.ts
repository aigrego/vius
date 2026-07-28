import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError, type SessionPayload } from '@/lib/session';

// /api/cron/* 统一鉴权：登录 + role=admin。
// 成功返回会话；失败直接返回对应信封的 Response（调用方 `if (x instanceof NextResponse) return x`）
export async function requireAdmin(): Promise<SessionPayload | NextResponse> {
  try {
    const session = await requireUser();
    if (session.role !== 'admin') {
      return NextResponse.json({ code: 403, data: null, message: '无权限' }, { status: 403 });
    }
    return session;
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    throw e;
  }
}
