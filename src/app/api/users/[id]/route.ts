import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { deleteUserWithRelations, findUserById, updateUser } from '@/model/User';
import { findRoleByKey } from '@/model/Role';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// PUT /api/users/[id] - 修改用户（仅 admin）：可改角色/密码/姓名
export const PUT = async (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const target = await findUserById(id);
    if (!target) {
      return NextResponse.json({ code: 404, data: null, message: '用户不存在' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const patch: { role?: string; name?: string | null; passwordHash?: string } = {};

    if (body?.role !== undefined) {
      const role = typeof body.role === 'string' ? body.role.trim() : '';
      const roleRow = await findRoleByKey(role);
      if (!roleRow) {
        return NextResponse.json({ code: 400, data: null, message: '角色不存在' }, { status: 400 });
      }
      // 防锁死：禁止把当前登录 admin 自己改成非 admin
      if (target.id === auth.uid && role !== 'admin') {
        return NextResponse.json(
          { code: 400, data: null, message: '不能将当前登录账号改为非管理员' },
          { status: 400 },
        );
      }
      patch.role = role;
    }

    if (body?.password !== undefined) {
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < 6) {
        return NextResponse.json({ code: 400, data: null, message: '密码至少 6 位' }, { status: 400 });
      }
      patch.passwordHash = await bcrypt.hash(password, 10);
    }

    if (body?.name !== undefined) {
      patch.name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ code: 400, data: null, message: '没有可更新的字段' }, { status: 400 });
    }

    const updated = await updateUser(id, patch);
    return NextResponse.json({
      code: 200,
      data: { id: updated.id, username: updated.username, name: updated.name, role: updated.role },
      message: '已更新',
    });
  } catch (error) {
    console.error('[api/users/[id]] 更新失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '更新失败' }, { status: 500 });
  }
};

// DELETE /api/users/[id] - 删除用户（仅 admin）：禁止删除自己；关联数据事务内处理
export const DELETE = async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    // 防锁死：禁止删除当前登录账号
    if (id === auth.uid) {
      return NextResponse.json(
        { code: 400, data: null, message: '不能删除当前登录账号' },
        { status: 400 },
      );
    }
    const target = await findUserById(id);
    if (!target) {
      return NextResponse.json({ code: 404, data: null, message: '用户不存在' }, { status: 404 });
    }

    await deleteUserWithRelations(id);
    return NextResponse.json({ code: 200, data: null, message: '已删除' });
  } catch (error) {
    console.error('[api/users/[id]] 删除失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '删除失败' }, { status: 500 });
  }
};
