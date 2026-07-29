import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { createRole, listRolesWithUserCount } from '@/model/Role';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// 角色 key 规则：小写字母开头，后续小写字母/数字/下划线，总长 2-20
const KEY_PATTERN = /^[a-z][a-z0-9_]{1,19}$/;

// Prisma 唯一约束冲突（P2002）判定
const isUniqueConflict = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002';

// GET /api/roles - 角色列表（仅 admin），附带各角色用户数
export const GET = async () => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const list = await listRolesWithUserCount();
    return NextResponse.json({ code: 200, data: list, message: '请求成功' });
  } catch (error) {
    console.error('[api/roles] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};

// POST /api/roles - 新增角色（仅 admin）
export const POST = async (request: NextRequest) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => null);
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    if (!KEY_PATTERN.test(key)) {
      return NextResponse.json(
        { code: 400, data: null, message: '角色 key 需为小写字母开头的 2-20 位小写字母/数字/下划线' },
        { status: 400 },
      );
    }
    if (!name || name.length > 20) {
      return NextResponse.json({ code: 400, data: null, message: '角色名称需为 1-20 字' }, { status: 400 });
    }

    const created = await createRole({ key, name });
    return NextResponse.json({
      code: 200,
      data: { id: created.id, key: created.key, name: created.name, builtin: created.builtin },
      message: '已创建',
    });
  } catch (error) {
    if (isUniqueConflict(error)) {
      return NextResponse.json({ code: 409, data: null, message: '角色 key 已存在' }, { status: 409 });
    }
    console.error('[api/roles] 创建失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '创建失败' }, { status: 500 });
  }
};
