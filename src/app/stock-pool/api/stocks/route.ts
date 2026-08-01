import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { requireRouteAccess } from '@/lib/route-perm';
import { resolveStock } from '@/lib/stock-resolver';
import { fetchRealtimeQuotes, type RealtimeQuote } from '@/lib/realtime';
import { ensureStockDict } from '@/model/StockDict';
import { replaceSnapshots } from '@/model/StockTrade';
import { parseFullCode } from '@/lib/stock-code';
import prisma from '@/lib/prisma';

// 股票代码格式（会被拼进外部行情 URL，必须严格校验）
const CODE_PATTERN = /^[0-9A-Za-z.]{1,12}$/;

// 字典 type（stock/index/etf）→ 旧前端契约 type（individual/etf）
const toLegacyType = (dictType: string): string => (dictType === 'stock' ? 'individual' : dictType);

// GET /api/stocks - 获取当前用户的股票池（按账号隔离）
export async function GET() {
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

    const stocks = await prisma.watchlist.findMany({
      where: { userId: session.uid },
      orderBy: { createdAt: 'desc' },
      include: { stock: true }
    });

    // 展开字典关联 + 解析 alertsJson；code 返回 6 位裸码、market 小写，保持旧前端契约
    const parsedStocks = stocks.map(({ stock, ...row }) => ({
      ...row,
      code: parseFullCode(row.stockCode).code,
      name: stock.name,
      market: stock.market.toLowerCase(),
      type: toLegacyType(stock.type),
      alerts: JSON.parse(row.alertsJson || '{}')
    }));

    return NextResponse.json({ success: true, data: parsedStocks });

  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { success: false, error: 'Database error' },
      { status: 500 }
    );
  }
}

// POST /api/stocks - 创建股票（只需 code，fullCode/名称/市场/类型由服务端自动解析）
export async function POST(request: Request) {
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

    const body = await request.json();

    const { code, alerts } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!CODE_PATTERN.test(code)) {
      return NextResponse.json(
        { success: false, error: 'Invalid stock code' },
        { status: 400 }
      );
    }

    // 自动解析 fullCode/名称/市场/类型（stock_dict 优先，实时行情兜底）
    const resolved = await resolveStock(code);
    if (!resolved) {
      return NextResponse.json(
        { success: false, error: '无法识别该股票代码，请确认后重试' },
        { status: 400 }
      );
    }

    // 字典懒建行（watchlist/stock_trade 的外键依赖字典行）；
    // type 归一为字典风格（resolver 若返回旧契约 individual 则映射为 stock）
    await ensureStockDict({
      code: resolved.stockCode,
      name: resolved.name,
      market: resolved.market,
      type: resolved.type === 'individual' ? 'stock' : resolved.type
    });

    // 关注价（markPrice）：best-effort 拉一次实时行情取当前价，失败为 null 不影响创建；
    // 放在事务前，随 create 一次写入，避免创建后再补一次 update
    let quote: RealtimeQuote | undefined;
    try {
      const quotes = await fetchRealtimeQuotes([code], [resolved.market.toLowerCase()]);
      quote = quotes.find(q => q.code.toUpperCase() === code.toUpperCase());
    } catch (e) {
      console.warn(`Create stock: 关注价获取失败 ${code}:`, e);
    }
    const markPrice = quote && quote.current > 0 ? quote.current : null;

    const agentId = session.username || 'web-ui';

    // 写操作与审计日志包在同一事务中
    const [stock] = await prisma.$transaction([
      prisma.watchlist.create({
        data: {
          userId: session.uid,
          stockCode: resolved.stockCode,
          cost: 0,
          markPrice,
          alertsJson: JSON.stringify(alerts || {})
        }
      }),
      prisma.auditLog.create({
        data: {
          action: 'CREATE',
          code: resolved.stockCode,
          details: `Created stock: ${resolved.name} (${resolved.stockCode})`,
          agentId
        }
      })
    ]);

    // 即时拉到的行情顺手写一行当日快照（sync-snapshot 每分钟会覆盖；失败不阻塞创建）
    if (quote) {
      try {
        await replaceSnapshots([{
          stockCode: resolved.stockCode,
          open: quote.open,
          current: quote.current,
          prevClose: quote.close,
          high: quote.high,
          low: quote.low,
          changePct: quote.changePct,
          // 新浪量单位为「股」，stock_trade 统一为「手」
          volume: quote.source === 'sina' ? quote.volume / 100 : quote.volume,
          amount: quote.amount
        }]);
      } catch (e) {
        console.warn(`Create stock: 当日快照写入失败 ${resolved.stockCode}:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...stock,
        code: parseFullCode(stock.stockCode).code,
        name: resolved.name,
        market: resolved.market.toLowerCase(),
        type: toLegacyType(resolved.type),
        alerts: JSON.parse(stock.alertsJson)
      }
    });

  } catch (error: any) {
    console.error('Create stock error:', error);
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Stock code already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create stock' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
