import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { createNewsSource, listNewsSources } from '@/model/NewsSource';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// 解析器白名单（key 决定抓取/解析逻辑）
const VALID_KEYS = ['wallstcn', 'xuangubao'];

// GET /api/news/manage/sources - 资讯数据源列表（仅 admin）
export const GET = async () => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const list = await listNewsSources();
    return NextResponse.json({ code: 200, data: list, message: '请求成功' });
  } catch (error) {
    console.error('[api/news/manage/sources] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};

// POST /api/news/manage/sources - 新增资讯数据源（仅 admin）
export const POST = async (request: NextRequest) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => null);
    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!VALID_KEYS.includes(key)) {
      return NextResponse.json(
        { code: 400, data: null, message: `解析器仅支持 ${VALID_KEYS.join('/')}` },
        { status: 400 }
      );
    }
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ code: 400, data: null, message: '数据源名称必填' }, { status: 400 });
    }
    const opt = (v: any, max: number): string | null =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

    const created = await createNewsSource({
      key,
      name: name.slice(0, 50),
      url: opt(body?.url, 255),
      params: opt(body?.params, 255),
      description: opt(body?.description, 255),
      enabled: typeof body?.enabled === 'boolean' ? body.enabled : true
    });
    return NextResponse.json({ code: 200, data: created, message: '已创建' });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ code: 400, data: null, message: '该解析器的数据源已存在' }, { status: 400 });
    }
    console.error('[api/news/manage/sources] 创建失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '创建失败' }, { status: 500 });
  }
};
