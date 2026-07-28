import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { createLhbSource, listLhbSources } from '@/model/LhbSource';

// 声明为动态路由
export const dynamic = 'force-dynamic';

// GET /api/lhb/manage/sources - 数据源列表（仅 admin）
export const GET = async () => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const list = await listLhbSources();
    return NextResponse.json({ code: 200, data: list, message: '请求成功' });
  } catch (error) {
    console.error('[api/lhb/manage/sources] 查询失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '查询失败' }, { status: 500 });
  }
};

// 从 body 提取数据源字段并做基础校验；非法时返回错误信息字符串
const parseSourceBody = (body: any): { data?: Parameters<typeof createLhbSource>[0]; error?: string } => {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: '数据源名称必填' };
  if (name.length > 50) return { error: '数据源名称过长' };
  const opt = (v: any, max: number): string | null =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
  return {
    data: {
      name,
      type: 'api', // 目前仅支持 API 接口
      url: opt(body?.url, 255),
      apiKey: opt(body?.apiKey, 255),
      cron: opt(body?.cron, 50),
      description: opt(body?.description, 255),
      enabled: typeof body?.enabled === 'boolean' ? body.enabled : true
    }
  };
};

// POST /api/lhb/manage/sources - 新增数据源（仅 admin）
export const POST = async (request: NextRequest) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => null);
    const { data, error } = parseSourceBody(body);
    if (error || !data) {
      return NextResponse.json({ code: 400, data: null, message: error ?? '参数错误' }, { status: 400 });
    }
    const created = await createLhbSource(data);
    return NextResponse.json({ code: 200, data: created, message: '已创建' });
  } catch (error) {
    console.error('[api/lhb/manage/sources] 创建失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '创建失败' }, { status: 500 });
  }
};
