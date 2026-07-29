import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { countRoleUsers, deleteRole, findRoleById, renameRole } from '@/model/Role';
import { clearRouteLevelCache } from '@/lib/route-perm';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// PUT /api/roles/[id] - 重命名角色（仅 admin；key 不可改）
export const PUT = async (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const role = await findRoleById(id);
    if (!role) {
      return NextResponse.json({ code: 404, data: null, message: '角色不存在' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 20) {
      return NextResponse.json({ code: 400, data: null, message: '角色名称需为 1-20 字' }, { status: 400 });
    }

    const updated = await renameRole(id, name);
    return NextResponse.json({
      code: 200,
      data: { id: updated.id, key: updated.key, name: updated.name, builtin: updated.builtin },
      message: '已更新',
    });
  } catch (error) {
    console.error('[api/roles/[id]] 更新失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '更新失败' }, { status: 500 });
  }
};

// DELETE /api/roles/[id] - 删除角色（仅 admin；内置或仍有用户使用不可删）
export const DELETE = async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    const role = await findRoleById(id);
    if (!role) {
      return NextResponse.json({ code: 404, data: null, message: '角色不存在' }, { status: 404 });
    }
    if (role.builtin) {
      return NextResponse.json({ code: 400, data: null, message: '内置角色不可删除' }, { status: 400 });
    }
    const userCount = await countRoleUsers(role.key);
    if (userCount > 0) {
      return NextResponse.json({ code: 400, data: null, message: '仍有用户使用该角色' }, { status: 400 });
    }

    await deleteRole(id); // 权限行随 onDelete: Cascade 一并清除
    clearRouteLevelCache(role.key);
    return NextResponse.json({ code: 200, data: null, message: '已删除' });
  } catch (error) {
    console.error('[api/roles/[id]] 删除失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '删除失败' }, { status: 500 });
  }
};
