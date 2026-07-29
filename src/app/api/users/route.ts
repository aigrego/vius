import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { createUser, listUsers } from '@/model/User';
import { findRoleByKey } from '@/model/Role';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// Prisma 唯一约束冲突（P2002）判定
const isUniqueConflict = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';

// GET /api/users - 用户列表（仅 admin）
export const GET = async () => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const list = await listUsers();
    return NextResponse.json({ code: 200, data: list, message: '请求成功' });
  } catch (error) {
    console.error('[api/users] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};

// POST /api/users - 新增用户（仅 admin）：用户名 2-32 位、密码 ≥6 位、role 须存在于 roles 表
export const POST = async (request: NextRequest) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => null);
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const role = typeof body?.role === 'string' ? body.role.trim() : '';
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : null;

    if (username.length < 2 || username.length > 32) {
      return NextResponse.json({ code: 400, data: null, message: '用户名需为 2-32 位' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ code: 400, data: null, message: '密码至少 6 位' }, { status: 400 });
    }
    const roleRow = await findRoleByKey(role);
    if (!roleRow) {
      return NextResponse.json({ code: 400, data: null, message: '角色不存在' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await createUser({ username, passwordHash, role, name });
    return NextResponse.json({
      code: 200,
      data: { id: created.id, username: created.username, name: created.name, role: created.role },
      message: '已创建',
    });
  } catch (error) {
    // 用户名唯一约束兜底（并发/直接冲突）
    if (isUniqueConflict(error)) {
      return NextResponse.json({ code: 409, data: null, message: '用户名已存在' }, { status: 409 });
    }
    console.error('[api/users] 创建失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '创建失败' }, { status: 500 });
  }
};
