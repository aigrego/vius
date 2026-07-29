import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/api/cron/require-admin';
import { updateRealtimeSource } from '@/model/RealtimeSource';

export const dynamic = 'force-dynamic';

// PUT /api/stocks/manage/sources/[id] - 更新行情数据源（启停/名称/顺序/描述；仅 admin）
// key 不可改（决定解析器）；不支持新增/删除，三个内置源恒定存在
export const PUT = async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const sourceId = parseInt(id, 10);
    if (!Number.isInteger(sourceId)) {
      return NextResponse.json({ code: 400, data: null, message: 'Invalid source id' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const data: { name?: string; sort?: number; description?: string | null; enabled?: boolean } = {};
    if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 50);
    if (Number.isInteger(body?.sort)) data.sort = body.sort;
    if (body?.description === null || typeof body?.description === 'string') {
      data.description = typeof body.description === 'string' && body.description.trim()
        ? body.description.trim().slice(0, 255)
        : null;
    }
    if (typeof body?.enabled === 'boolean') data.enabled = body.enabled;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ code: 400, data: null, message: '无可更新字段' }, { status: 400 });
    }

    const updated = await updateRealtimeSource(sourceId, data);
    return NextResponse.json({ code: 200, data: updated, message: '已更新' });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ code: 404, data: null, message: '数据源不存在' }, { status: 404 });
    }
    console.error('[api/stocks/manage/sources] 更新失败:', error);
    return NextResponse.json({ code: 500, data: null, message: '更新失败' }, { status: 500 });
  }
};
