import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { deleteNewsSource, updateNewsSource } from '@/model/NewsSource';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const parseId = (raw: string): number | null => {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// PUT /api/news/manage/sources/[id] - 编辑资讯数据源（仅 admin，含启停 enabled；key 不可改）
export const PUT = async (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const id = parseId((await ctx.params).id);
    if (!id) {
      return NextResponse.json({ code: 400, data: null, message: 'id 非法' }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ code: 400, data: null, message: '参数错误' }, { status: 400 });
    }

    const opt = (v: any, max: number): string | null =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
    const data: Record<string, unknown> = {};
    if ('name' in body) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ code: 400, data: null, message: '数据源名称必填' }, { status: 400 });
      }
      data.name = body.name.trim().slice(0, 50);
    }
    if ('url' in body) data.url = opt(body.url, 255);
    if ('params' in body) data.params = opt(body.params, 255);
    if ('description' in body) data.description = opt(body.description, 255);
    if ('enabled' in body) {
      if (typeof body.enabled !== 'boolean') {
        return NextResponse.json({ code: 400, data: null, message: 'enabled 应为布尔值' }, { status: 400 });
      }
      data.enabled = body.enabled;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ code: 400, data: null, message: '没有需要更新的字段' }, { status: 400 });
    }

    const updated = await updateNewsSource(id, data);
    return NextResponse.json({ code: 200, data: updated, message: '已更新' });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ code: 404, data: null, message: '数据源不存在' }, { status: 404 });
    }
    console.error('[api/news/manage/sources/[id]] 更新失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '更新失败' }, { status: 500 });
  }
};

// DELETE /api/news/manage/sources/[id] - 删除资讯数据源（仅 admin，不影响已落库的快讯）
export const DELETE = async (_request: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const id = parseId((await ctx.params).id);
    if (!id) {
      return NextResponse.json({ code: 400, data: null, message: 'id 非法' }, { status: 400 });
    }
    await deleteNewsSource(id);
    return NextResponse.json({ code: 200, data: { id }, message: '已删除' });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ code: 404, data: null, message: '数据源不存在' }, { status: 404 });
    }
    console.error('[api/news/manage/sources/[id]] 删除失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '删除失败' }, { status: 500 });
  }
};
