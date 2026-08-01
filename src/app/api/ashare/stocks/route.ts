import { handleApiError } from '@/utils/api-response';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRouteAccess } from '@/lib/route-perm';
import { parseFullCode } from '@/lib/stock-code';

// 声明为动态路由：依赖 searchParams，避免构建期静态化/缓存
export const dynamic = 'force-dynamic';

const VALID_MARKETS = ['sh', 'sz', 'bj'];
const MAX_PAGE_SIZE = 200;

// GET /api/ashare/stocks - A 股股票清单（stock_dict type='stock'，支持关键字模糊搜索与分页）
export const GET = async (request: NextRequest) => {
  try {
    // 路由权限：/ashare 为 hidden 时 403
    const auth = await requireRouteAccess('/ashare');
    if (auth instanceof NextResponse) return auth;

    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword')?.trim() || '';
    const market = searchParams.get('market')?.trim() || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50)
    );

    if (market && !VALID_MARKETS.includes(market)) {
      return NextResponse.json(
        { code: 400, data: null, message: `market 仅支持 ${VALID_MARKETS.join('/')}` },
        { status: 400 }
      );
    }

    const where = {
      isActive: true,
      type: 'stock',
      // market 参数小写传入，字典中统一大写存储
      ...(market ? { market: market.toUpperCase() } : {}),
      // 关键字匹配名称或代码（fullCode 包含 6 位裸码，contains 直接可用）
      ...(keyword
        ? { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] }
        : {})
    };

    const [total, rows] = await Promise.all([
      prisma.stockDict.count({ where }),
      prisma.stockDict.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    // 本页股票各自最近一条交易行（现价/涨跌幅/成交量/换手率/振幅）+ 所属板块（行业/题材）。
    // 不用「全库最新交易日」：盘中快照只覆盖关注股，按全库最新日会大面积缺行；各取最近一行更贴合列表展示
    const fullCodes = rows.map(r => r.code);
    const [tradeRows, plateRows] = await Promise.all([
      prisma.stockTrade.findMany({
        where: { stockCode: { in: fullCodes } },
        distinct: ['stockCode'],
        orderBy: [{ stockCode: 'asc' }, { date: 'desc' }]
      }),
      prisma.plateStock.findMany({
        where: { stockCode: { in: fullCodes } },
        select: { stockCode: true, plate: { select: { name: true, kind: true } } }
      })
    ]);
    const tradeMap = new Map(tradeRows.map(t => [t.stockCode, t]));
    const plateMap = new Map<string, { industry: string[]; concept: string[] }>();
    for (const pr of plateRows) {
      const entry = plateMap.get(pr.stockCode) ?? { industry: [], concept: [] };
      (pr.plate.kind === 'industry' ? entry.industry : entry.concept).push(pr.plate.name);
      plateMap.set(pr.stockCode, entry);
    }

    // 保持旧契约：code 为 6 位裸码、market 小写；附带市值/最新行情快照/板块等扩展字段
    const list = rows.map(row => {
      const t = tradeMap.get(row.code);
      const fin = (row.financials ?? null) as { pe?: number } | null;
      const plates = plateMap.get(row.code);
      return {
        code: parseFullCode(row.code).code,
        name: row.name,
        market: row.market.toLowerCase(),
        listedDate: row.listedDate,
        isActive: row.isActive,
        updatedAt: row.updatedAt,
        marketCap: row.marketCap,
        floatMarketCap: row.floatMarketCap,
        pe: fin?.pe ?? null,
        // 0 值按无数据展示（退市股历史行存在 0 价/0 量）
        current: t?.current || null,
        changePct: t?.changePct ?? null,
        volume: t?.volume || null, // 手
        turnover: t?.turnover || null, // %
        amplitude: t?.amplitude || null, // %
        industryPlates: plates?.industry ?? [],
        conceptPlates: plates?.concept ?? []
      };
    });

    return NextResponse.json({
      code: 200,
      data: { list, total, page, pageSize },
      message: '请求成功'
    });
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 });
  }
};
