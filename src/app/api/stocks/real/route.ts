import { NextRequest, NextResponse } from 'next/server';
import { getStocks } from '@/model/Stock';
import { fetchRealtimeQuotes, type RealtimeQuote } from '@/lib/realtime';

// 声明为动态路由：实时行情，禁止缓存
export const dynamic = 'force-dynamic';

/* 行情快照（wallstcn api-ddc.market/real 的替代，该域名已 DNS 下线）。
   - 无参：指数清单读 stock 表，行情走 lib/realtime 三源降级（行情总览页指数卡片）；
   - ?prod_code=000001.SS,00700.HK&fields=...：任意代码快照，A股/港股走东财 ulist
     全字段（含换手率/PE/PB/市值，供个股详情页），美股走 lib/realtime。
   响应保持 wallstcn 的 fields + snapshot 形状（snapshot 行按请求 fields 顺序取值），
   前端组件只需换 host。5 秒内存缓存兜底快讯 StocksTag 的高频轮询。 */

interface Snap {
  name: string;
  last: number;
  open: number;
  preclose: number;
  high: number;
  low: number;
  volume: number; // 股
  amount: number; // 元
  turnoverRatio: number;
  pe: number;
  pb: number;
  marketValue: number;
  circulationValue: number;
  source: string;
}

// 完整代码 → 市场（SS/SH→sh，SZ→sz，BJ→bj，HK→hk，其余按美股处理）
function parseFullCode(full: string): { code: string; market: string } {
  const [code = '', suffix = ''] = full.split('.');
  const sfx = suffix.toUpperCase();
  if (sfx === 'SS' || sfx === 'SH') return { code, market: 'sh' };
  if (sfx === 'SZ') return { code, market: 'sz' };
  if (sfx === 'BJ') return { code, market: 'bj' };
  if (sfx === 'HK') return { code, market: 'hk' };
  return { code, market: 'us' };
}

const EM_MARKET: Record<string, string> = { sh: '1', sz: '0', bj: '0', hk: '116' };

// 东财 ulist 全字段快照（A股/港股）。f5 成交量单位为「手」，这里 ×100 转成股。
async function fetchEastMoneySnaps(items: { code: string; market: string }[]): Promise<Map<string, Snap>> {
  const secids = items.map((i) => `${EM_MARKET[i.market]}.${i.code}`).join(',');
  const fields = 'f12,f14,f2,f3,f5,f6,f8,f9,f15,f16,f17,f18,f20,f21,f23';
  const resp = await fetch(`https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=${fields}&secids=${secids}`, {
    signal: AbortSignal.timeout(5000),
    headers: {
      Referer: 'https://quote.eastmoney.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!resp.ok) throw new Error(`eastmoney ${resp.status}`);
  const json = await resp.json();
  const result = new Map<string, Snap>();
  for (const item of json?.data?.diff ?? []) {
    if (typeof item.f2 !== 'number') continue; // 停牌/无数据
    result.set(String(item.f12), {
      name: item.f14 ?? '',
      last: item.f2,
      open: num(item.f17),
      preclose: num(item.f18),
      high: num(item.f15),
      low: num(item.f16),
      volume: num(item.f5) * 100,
      amount: num(item.f6),
      turnoverRatio: num(item.f8),
      pe: num(item.f9),
      pb: num(item.f23),
      marketValue: num(item.f20),
      circulationValue: num(item.f21),
      source: 'eastmoney',
    });
  }
  return result;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function fromRealtime(q: RealtimeQuote): Snap {
  return {
    name: q.name,
    last: q.current,
    open: q.open,
    preclose: q.close,
    high: q.high,
    low: q.low,
    volume: q.volume,
    amount: q.amount,
    turnoverRatio: 0,
    pe: 0,
    pb: 0,
    marketValue: 0,
    circulationValue: 0,
    source: q.source,
  };
}

const round = (v: number, p = 1000) => Math.round(v * p) / p;

/* 按 wallstcn 字段名取值；拿不到的字段给 0/''（前端有 .toFixed 调用，不能给 undefined）。 */
function fieldValue(fullCode: string, bareCode: string, s: Snap, field: string): string | number {
  switch (field) {
    case 'prod_code':
      return fullCode;
    case 'symbol':
      return bareCode;
    case 'prod_name':
      return s.name;
    case 'last_px':
      return s.last;
    case 'px_change':
      return round(s.last - s.preclose);
    case 'px_change_rate':
      return s.preclose > 0 ? round(((s.last - s.preclose) / s.preclose) * 100, 100) : 0;
    case 'high_px':
      return s.high;
    case 'low_px':
      return s.low;
    case 'open_px':
      return s.open;
    case 'preclose_px':
      return s.preclose;
    case 'turnover_volume':
      return s.volume;
    case 'turnover_value':
      return s.amount;
    case 'turnover_ratio':
      return s.turnoverRatio;
    case 'dyn_pe':
      return s.pe;
    case 'dyn_pb_rate':
      return s.pb;
    case 'market_value':
      return s.marketValue;
    case 'circulation_value':
      return s.circulationValue;
    case 'amplitude':
      return s.preclose > 0 ? round(((s.high - s.low) / s.preclose) * 100, 100) : 0;
    case 'update_time':
      return Math.floor(Date.now() / 1000);
    case 'price_precision':
      return 2;
    case 'source':
      return s.source;
    case 'trade_status':
    case 'delisting_date':
      return '';
    default:
      return 0; // week_52_high / week_52_low / static_pe 等暂无数据源
  }
}

const DEFAULT_FIELDS = [
  'prod_code',
  'prod_name',
  'price_precision',
  'update_time',
  'last_px',
  'px_change',
  'px_change_rate',
  'trade_status',
];

// 5 秒内存缓存：快讯 StocksTag 每个条目都在轮询，避免把东财打爆
const cache = new Map<string, { t: number; body: string }>();
const CACHE_TTL = 5000;

export const GET = async (req: NextRequest) => {
  try {
    const prodCode = req.nextUrl.searchParams.get('prod_code');
    const fields = (req.nextUrl.searchParams.get('fields')?.split(',').filter(Boolean) ?? []).concat();
    const useFields = fields.length > 0 ? fields : DEFAULT_FIELDS;

    // —— 任意代码快照（快讯 StocksTag / 个股详情页） ——
    if (prodCode) {
      const cacheKey = `${prodCode}|${useFields.join(',')}`;
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.t < CACHE_TTL) {
        return new NextResponse(hit.body, { headers: { 'Content-Type': 'application/json' } });
      }

      const fullCodes = prodCode.split(',').filter(Boolean).slice(0, 60);
      const parsed = fullCodes.map(parseFullCode);
      const snaps = new Map<string, Snap>();

      const emItems = parsed.filter((p) => p.market !== 'us');
      if (emItems.length > 0) {
        try {
          for (const [code, snap] of await fetchEastMoneySnaps(emItems)) snaps.set(code, snap);
        } catch (e) {
          console.warn('[stocks/real] eastmoney snapshot failed, fallback realtime:', e);
        }
      }
      // 美股 + 东财失败的代码 → lib/realtime 三源降级
      const missing = parsed.filter((p) => !snaps.has(p.code));
      if (missing.length > 0) {
        try {
          const quotes = await fetchRealtimeQuotes(
            missing.map((m) => m.code),
            missing.map((m) => m.market),
          );
          for (const q of quotes) snaps.set(q.code, fromRealtime(q));
        } catch (e) {
          console.warn('[stocks/real] realtime fallback failed:', e);
        }
      }

      const snapshot: Record<string, Array<string | number>> = {};
      for (let i = 0; i < fullCodes.length; i++) {
        const s = snaps.get(parsed[i]!.code);
        if (!s) continue;
        snapshot[fullCodes[i]!] = useFields.map((f) => fieldValue(fullCodes[i]!, parsed[i]!.code, s, f));
      }

      const body = JSON.stringify({ code: 200, data: { fields: useFields, snapshot }, message: '请求成功' });
      cache.set(cacheKey, { t: Date.now(), body });
      return new NextResponse(body, { headers: { 'Content-Type': 'application/json' } });
    }

    // —— 指数卡片（stock 表清单 + 三源降级） ——
    const stocks = await getStocks();
    const quotes = await fetchRealtimeQuotes(
      stocks.map((s) => s.code),
      stocks.map((s) => (s.source === 'SS' ? 'sh' : 'sz')),
    );
    const byCode = new Map(quotes.map((q) => [q.code, q]));

    const snapshot: Record<string, Array<string | number>> = {};
    for (const s of stocks) {
      const q = byCode.get(s.code);
      if (!q) continue;
      const fullCode = `${s.code}.${s.source}`;
      snapshot[fullCode] = useFields.map((f) => fieldValue(fullCode, s.code, fromRealtime(q), f));
    }

    return NextResponse.json({ code: 200, data: { fields: useFields, snapshot }, message: '请求成功' });
  } catch {
    return NextResponse.json({ code: 500, data: null, message: '行情获取失败' }, { status: 500 });
  }
};
