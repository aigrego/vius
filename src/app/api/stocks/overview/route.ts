import { NextRequest, NextResponse } from 'next/server';
import type { Position, Watchlist } from '@prisma/client';
import { requireUser, UnauthorizedError } from '@/lib/session';
import { getStocks } from '@/model/Stock';
import { fetchRealtimeQuotes, type RealtimeQuote } from '@/lib/realtime';
import prisma from '@/lib/prisma';

// 声明为动态路由：行情数据，禁止缓存
export const dynamic = 'force-dynamic';

/* 行情总览三排卡片（指数/持仓股/股票池）的服务端缓存接口。
   - 无参：只读 overview_cache 立即返回（页面首屏用），不触发任何外部行情请求；
   - ?refresh=1：重算三排数据并 upsert 缓存后返回新鲜数据。
   indices 为全局共享缓存（userId='*'），positions/watchlist 按用户隔离。
   指数行情与用户股票行情分别 try/catch：任一方失败时该排回退旧缓存，不拖垮整个响应。 */

type Kind = 'indices' | 'positions' | 'watchlist';
// 全局缓存行的 userId 占位（指数三排对所有用户相同）
const GLOBAL_USER = '*';

interface OverviewData {
  indices: unknown[] | null;
  positions: unknown[] | null;
  watchlist: unknown[] | null;
  updatedAt: Partial<Record<Kind, string>>;
}

const round = (v: number, p = 100) => Math.round(v * p) / p;

// 只读缓存：三行 overview_cache → data；未缓存的排为 null
async function readCache(uid: string): Promise<OverviewData> {
  const rows = await prisma.overviewCache.findMany({
    where: {
      OR: [
        { userId: GLOBAL_USER, kind: 'indices' },
        { userId: uid, kind: 'positions' },
        { userId: uid, kind: 'watchlist' },
      ],
    },
  });
  const parse = (kind: Kind): unknown[] | null => {
    const row = rows.find((r) => r.kind === kind);
    if (!row) return null;
    try {
      return JSON.parse(row.payload);
    } catch {
      return null;
    }
  };
  const updatedAt: Partial<Record<Kind, string>> = {};
  for (const row of rows) updatedAt[row.kind as Kind] = row.updatedAt.toISOString();
  return { indices: parse('indices'), positions: parse('positions'), watchlist: parse('watchlist'), updatedAt };
}

function upsertCache(userId: string, kind: Kind, payload: unknown) {
  const json = JSON.stringify(payload);
  return prisma.overviewCache.upsert({
    where: { userId_kind: { userId, kind } },
    create: { userId, kind, payload: json },
    update: { payload: json },
  });
}

// 指数排：stock 表清单 + 三源降级行情（同 /api/stocks/real 无参分支的取数方式）
async function buildIndices(): Promise<unknown[]> {
  const stocks = await getStocks();
  const quotes = await fetchRealtimeQuotes(
    stocks.map((s) => s.code),
    stocks.map((s) => (s.source === 'SS' ? 'sh' : 'sz')),
  );
  const byCode = new Map(quotes.map((q) => [q.code, q]));
  const result = [];
  for (const s of stocks) {
    const q = byCode.get(s.code);
    if (!q) continue;
    result.push({
      code: `${s.code}.${s.source}`, // 全代码，如 000001.SS
      name: q.name,
      last_px: q.current,
      px_change: round(q.current - q.close, 1000),
      px_change_rate: q.close > 0 ? round(((q.current - q.close) / q.close) * 100) : 0,
    });
  }
  return result;
}

// 持仓 + 股票池的 code 合并去重后一次批量拉行情（marketHints 用各记录的 market 字段）
async function fetchUserQuotes(positions: Position[], watchlist: Watchlist[]): Promise<Map<string, RealtimeQuote>> {
  const marketByCode = new Map<string, string>();
  for (const p of positions) marketByCode.set(p.code, p.market);
  for (const w of watchlist) if (!marketByCode.has(w.code)) marketByCode.set(w.code, w.market);
  if (marketByCode.size === 0) return new Map();
  const codes = [...marketByCode.keys()];
  const quotes = await fetchRealtimeQuotes(codes, codes.map((c) => marketByCode.get(c)!));
  // key 统一大写，兼容美股代码大小写差异
  return new Map(quotes.map((q) => [q.code.toUpperCase(), q]));
}

// 近 7 天快讯一次查出，内存里按 code 统计条数（持仓/股票池两排共用，避免逐 code 查询）
async function buildNewsCountMap(): Promise<Map<string, number>> {
  const newsCountByCode = new Map<string, number>();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const newsRows = await prisma.newsFlash.findMany({
    where: { publishedAt: { gte: since }, codes: { not: null } },
    select: { codes: true },
  });
  for (const row of newsRows) {
    for (const raw of (row.codes ?? '').split(',')) {
      const code = raw.trim().toUpperCase();
      if (code) newsCountByCode.set(code, (newsCountByCode.get(code) ?? 0) + 1);
    }
  }
  return newsCountByCode;
}

// 持仓排：同 code 多条持仓合并，数量累加、成本按 (price×qty) 加权平均
function buildPositions(positions: Position[], quoteByCode: Map<string, RealtimeQuote>, newsCountByCode: Map<string, number>) {
  const groups = new Map<string, { code: string; name: string; market: string; totalQty: number; costSum: number }>();
  for (const p of positions) {
    const g = groups.get(p.code) ?? { code: p.code, name: p.name, market: p.market, totalQty: 0, costSum: 0 };
    g.totalQty += p.quantity;
    g.costSum += Number(p.price) * p.quantity;
    groups.set(p.code, g);
  }
  return [...groups.values()].map((g) => {
    const q = quoteByCode.get(g.code.toUpperCase());
    const current = q?.current ?? 0;
    const avgCost = g.totalQty > 0 ? g.costSum / g.totalQty : 0;
    return {
      code: g.code,
      name: q?.name || g.name,
      market: g.market,
      totalQty: g.totalQty,
      avgCost: round(avgCost, 10000),
      current,
      change: q ? round(q.current - q.close, 1000) : 0,
      changePct: q?.changePct ?? 0,
      // 无行情时 pnl 给 null，前端显示 '-'
      pnl: q ? round((current - avgCost) * g.totalQty) : null,
      newsCount: newsCountByCode.get(g.code.toUpperCase()) ?? 0,
    };
  });
}

// 股票池排：关注后涨跌幅（markPrice 为 null 时懒回填为当前价）+ 近 7 天关联资讯数
async function buildWatchlist(watchlist: Watchlist[], quoteByCode: Map<string, RealtimeQuote>, newsCountByCode: Map<string, number>) {
  const backfills: Promise<unknown>[] = [];
  const result = watchlist.map((w) => {
    const q = quoteByCode.get(w.code.toUpperCase());
    const current = q?.current ?? 0;
    let sincePct = 0;
    let sinceChange = 0;
    if (w.markPrice !== null) {
      const mark = Number(w.markPrice);
      sincePct = q && mark > 0 ? round(((current - mark) / mark) * 100) : 0;
      sinceChange = q && mark > 0 ? round(current - mark, 1000) : 0;
    } else if (q && current > 0) {
      // 存量数据没有关注价：懒回填为当前价（best-effort），当次涨跌幅记 0
      backfills.push(
        prisma.watchlist
          .update({ where: { id: w.id }, data: { markPrice: current } })
          .catch((e) => console.warn(`[stocks/overview] markPrice 回填失败 ${w.code}:`, e)),
      );
    }
    return {
      code: w.code,
      name: q?.name || w.name,
      market: w.market,
      current,
      change: q ? round(q.current - q.close, 1000) : 0,
      changePct: q?.changePct ?? 0,
      sincePct,
      sinceChange, // 关注后涨跌额
      newsCount: newsCountByCode.get(w.code.toUpperCase()) ?? 0,
    };
  });
  await Promise.all(backfills);
  return result;
}

// ?refresh=1：重算三排并 upsert 缓存；失败的排回退旧缓存并在 message 中说明
async function refresh(uid: string): Promise<{ data: OverviewData; notes: string[] }> {
  const [positions, watchlistRows] = await Promise.all([
    prisma.position.findMany({ where: { userId: uid } }),
    prisma.watchlist.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' } }),
  ]);

  const data: OverviewData = { indices: null, positions: null, watchlist: null, updatedAt: {} };
  const notes: string[] = [];
  const upserts: Promise<unknown>[] = [];
  const refreshedAt = new Date().toISOString();

  // 指数排（独立 try/catch，失败不拖垮用户股票两排）
  try {
    data.indices = await buildIndices();
    data.updatedAt.indices = refreshedAt;
    upserts.push(upsertCache(GLOBAL_USER, 'indices', data.indices));
  } catch (e) {
    console.warn('[stocks/overview] indices refresh failed:', e);
    notes.push('指数行情获取失败，已回退缓存数据');
  }

  // 持仓 + 股票池（合并为一次行情请求；资讯统计两排共用一次查询）
  try {
    const quoteByCode = await fetchUserQuotes(positions, watchlistRows);
    const newsCountByCode =
      positions.length > 0 || watchlistRows.length > 0 ? await buildNewsCountMap() : new Map<string, number>();
    data.positions = buildPositions(positions, quoteByCode, newsCountByCode);
    data.watchlist = await buildWatchlist(watchlistRows, quoteByCode, newsCountByCode);
    data.updatedAt.positions = refreshedAt;
    data.updatedAt.watchlist = refreshedAt;
    upserts.push(upsertCache(uid, 'positions', data.positions));
    upserts.push(upsertCache(uid, 'watchlist', data.watchlist));
  } catch (e) {
    console.warn('[stocks/overview] user stocks refresh failed:', e);
    notes.push('持仓/股票池行情获取失败，已回退缓存数据');
  }

  await Promise.all(upserts);

  // 失败的排回退旧缓存（updatedAt 也用缓存行的）
  if (data.indices === null || data.positions === null || data.watchlist === null) {
    const cached = await readCache(uid);
    if (data.indices === null) {
      data.indices = cached.indices;
      if (cached.updatedAt.indices) data.updatedAt.indices = cached.updatedAt.indices;
    }
    if (data.positions === null) {
      data.positions = cached.positions;
      if (cached.updatedAt.positions) data.updatedAt.positions = cached.updatedAt.positions;
    }
    if (data.watchlist === null) {
      data.watchlist = cached.watchlist;
      if (cached.updatedAt.watchlist) data.updatedAt.watchlist = cached.updatedAt.watchlist;
    }
  }

  return { data, notes };
}

export const GET = async (req: NextRequest) => {
  let session;
  try {
    session = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ code: 401, data: null, message: '未登录' }, { status: 401 });
    }
    throw e;
  }

  try {
    if (req.nextUrl.searchParams.get('refresh') === '1') {
      const { data, notes } = await refresh(session.uid);
      return NextResponse.json({ code: 200, data, message: notes.length > 0 ? notes.join('；') : '请求成功' });
    }
    const data = await readCache(session.uid);
    return NextResponse.json({ code: 200, data, message: '请求成功' });
  } catch (e) {
    console.error('[stocks/overview] error:', e);
    return NextResponse.json({ code: 500, data: null, message: '总览数据获取失败' }, { status: 500 });
  }
};
