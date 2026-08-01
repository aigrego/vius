import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import { parseFullCode, toFullCode } from '@/lib/stock-code';
import prisma from '@/lib/prisma';

// 股票代码格式（会被拼进外部行情 URL，必须严格校验）
const CODE_PATTERN = /^[0-9A-Za-z.]{1,12}$/;

// 字典 type（stock/index/etf）→ 旧前端契约 type（individual/etf）
const toLegacyType = (dictType: string): string => (dictType === 'stock' ? 'individual' : dictType);

// 动态参数 [code] 可能是裸码（600519）也可能带市场前缀（SH600519）：解析为候选 fullCode 列表。
// 裸码按 A 股前缀推断；5 位数字额外兼容港股（HK 前缀），避免旧契约裸码往返时丢失市场
const resolveStockCodeCandidates = (raw: string): string[] => {
  const parsed = parseFullCode(raw.toUpperCase());
  if (parsed.market) return [`${parsed.market}${parsed.code}`];
  const candidates = [toFullCode(parsed.code)];
  if (/^\d{5}$/.test(parsed.code)) candidates.push(`HK${parsed.code}`);
  return candidates;
};

// 按候选 fullCode 查当前用户的股票池行（含字典关联）
const findMine = (userId: string, candidates: string[]) =>
  prisma.watchlist.findFirst({
    where: { userId, stockCode: { in: candidates } },
    include: { stock: true }
  });

// GET /api/stocks/[code] - 获取当前用户的单个股票
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    // 路由权限：/pool 为 hidden 时 403
    const auth = await requireRouteAccess('/pool');
    if (auth instanceof NextResponse) return auth;
    let session;
    try {
      session = await requireUser();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return NextResponse.json(
          { success: false, error: '未登录' },
          { status: 401 }
        );
      }
      throw e;
    }

    const { code } = await params;

    const stock = await findMine(session.uid, resolveStockCodeCandidates(code));

    if (!stock) {
      return NextResponse.json(
        { success: false, error: 'Stock not found' },
        { status: 404 }
      );
    }

    const { stock: dict, ...row } = stock;
    return NextResponse.json({
      success: true,
      data: {
        ...row,
        code: parseFullCode(row.stockCode).code,
        name: dict.name,
        market: dict.market.toLowerCase(),
        type: toLegacyType(dict.type),
        alerts: JSON.parse(row.alertsJson || '{}')
      }
    });

  } catch (error) {
    console.error('Get stock error:', error);
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    );
  }
}

// PUT /api/stocks/[code] - 更新股票（名称/市场/类型以 stock_dict 为准不再可改，仅可改成本/告警）
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    // 路由权限：/pool 写操作需 rw
    const auth = await requireRouteAccess('/pool', { write: true });
    if (auth instanceof NextResponse) return auth;
    let session;
    try {
      session = await requireUser();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return NextResponse.json(
          { success: false, error: '未登录' },
          { status: 401 }
        );
      }
      throw e;
    }

    const { code } = await params;
    const body = await request.json();

    // name/market/type 字段由字典托管，旧前端即使传了也忽略
    const { cost, alerts } = body;

    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid stock code' },
        { status: 400 }
      );
    }

    // 先解析出实际 fullCode（裸码可能推断出多个候选），再按复合唯一键更新
    const existing = await findMine(session.uid, resolveStockCodeCandidates(code));
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Stock not found' },
        { status: 404 }
      );
    }

    // 写操作与审计日志包在同一事务中（按用户隔离，只能改自己的股票）
    const [updated] = await prisma.$transaction([
      prisma.watchlist.update({
        where: { userId_stockCode: { userId: session.uid, stockCode: existing.stockCode } },
        data: {
          ...(cost !== undefined && { cost }),
          ...(alerts && { alertsJson: JSON.stringify(alerts) })
        },
        include: { stock: true }
      }),
      prisma.auditLog.create({
        data: {
          action: 'UPDATE',
          code: existing.stockCode,
          details: `Updated stock: ${existing.stock.name} (${existing.stockCode})`,
          agentId: session.username || 'web-ui'
        }
      })
    ]);

    const { stock: dict, ...row } = updated;
    return NextResponse.json({
      success: true,
      data: {
        ...row,
        code: parseFullCode(row.stockCode).code,
        name: dict.name,
        market: dict.market.toLowerCase(),
        type: toLegacyType(dict.type),
        alerts: JSON.parse(row.alertsJson || '{}')
      }
    });

  } catch (error: any) {
    console.error('Update stock error:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Stock not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update stock' },
      { status: 500 }
    );
  }
}

// DELETE /api/stocks/[code] - 删除股票
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    // 路由权限：/pool 写操作需 rw
    const auth = await requireRouteAccess('/pool', { write: true });
    if (auth instanceof NextResponse) return auth;
    let session;
    try {
      session = await requireUser();
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return NextResponse.json(
          { success: false, error: '未登录' },
          { status: 401 }
        );
      }
      throw e;
    }

    const { code } = await params;

    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid stock code' },
        { status: 400 }
      );
    }

    // 先解析出实际 fullCode（裸码可能推断出多个候选），再按复合唯一键删除
    const existing = await findMine(session.uid, resolveStockCodeCandidates(code));
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Stock not found' },
        { status: 404 }
      );
    }

    // 写操作与审计日志包在同一事务中（按用户隔离，只能删自己的股票）
    await prisma.$transaction([
      prisma.watchlist.delete({
        where: { userId_stockCode: { userId: session.uid, stockCode: existing.stockCode } }
      }),
      prisma.auditLog.create({
        data: {
          action: 'DELETE',
          code: existing.stockCode,
          details: `Deleted stock: ${existing.stockCode}`,
          agentId: session.username || 'web-ui'
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: 'Stock deleted successfully'
    });

  } catch (error: any) {
    console.error('Delete stock error:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Stock not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to delete stock' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
