// 东方财富龙虎榜接口封装（datacenter-web）：个股上榜榜单 + 营业部席位明细
// 与 eastmoney.ts 的行情接口不同域名/Referer，故单独封装；同样带超时 + 重试

import { runWithConcurrency } from '@/lib/eastmoney';
import type { TLhbStockInput, TLhbSeatInput } from '@/model/Lhb';

const DC_BASE = 'https://datacenter-web.eastmoney.com/api/data/v1/get';
const DC_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 8000;
const RETRY_TIMES = 2;
const RETRY_INTERVAL_MS = 800;
const PAGE_SIZE = 500; // datacenter 单页上限 500

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 带超时与重试的 datacenter 请求，返回 data 数组与总页数
async function fetchDatacenter(params: Record<string, string>): Promise<{ pages: number; data: any[] }> {
  const qs = new URLSearchParams(params).toString();
  const url = `${DC_BASE}?${qs}`;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_TIMES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Referer': 'https://data.eastmoney.com/',
          'User-Agent': DC_UA
        }
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`EastMoney datacenter HTTP ${response.status}`);
      const json = await response.json();
      return { pages: json?.result?.pages ?? 0, data: json?.result?.data ?? [] };
    } catch (error) {
      lastError = error as Error;
      if (attempt < RETRY_TIMES) await sleep(RETRY_INTERVAL_MS);
    }
  }
  throw lastError || new Error('EastMoney datacenter fetch failed');
}

// 拉取某日龙虎榜个股上榜榜单（RPT_DAILYBILLBOARD_DETAILS，分页拉全）
export const fetchLhbStocks = async (dateStr: string): Promise<TLhbStockInput[]> => {
  const base: Record<string, string> = {
    reportName: 'RPT_DAILYBILLBOARD_DETAILS',
    columns: 'SECURITY_CODE,SECURITY_NAME_ABBR,TRADE_DATE,CLOSE_PRICE,CHANGE_RATE,ACCUM_AMOUNT,EXPLANATION,BILLBOARD_BUY_AMT,BILLBOARD_SELL_AMT,BILLBOARD_NET_AMT,CHANGE_TYPE,TRADE_ID,MARKET',
    sortColumns: 'SECURITY_CODE',
    sortTypes: '1',
    pageSize: String(PAGE_SIZE),
    filter: `(TRADE_DATE='${dateStr}')`
  };
  const first = await fetchDatacenter({ ...base, pageNumber: '1' });
  const rows = [...first.data];
  for (let page = 2; page <= first.pages; page++) {
    const res = await fetchDatacenter({ ...base, pageNumber: String(page) });
    rows.push(...res.data);
    if (page < first.pages) await sleep(200);
  }
  return rows
    .filter(r => r.SECURITY_CODE && r.TRADE_ID != null)
    .map(r => ({
      code: String(r.SECURITY_CODE),
      name: String(r.SECURITY_NAME_ABBR ?? ''),
      market: String(r.MARKET ?? '').toLowerCase(),
      closePrice: Number(r.CLOSE_PRICE ?? 0),
      changePct: Number(r.CHANGE_RATE ?? 0),
      amount: Number(r.ACCUM_AMOUNT ?? 0),
      reason: String(r.EXPLANATION ?? ''),
      changeType: String(r.CHANGE_TYPE ?? ''),
      tradeId: String(r.TRADE_ID),
      buyAmt: Number(r.BILLBOARD_BUY_AMT ?? 0),
      sellAmt: Number(r.BILLBOARD_SELL_AMT ?? 0),
      netAmt: Number(r.BILLBOARD_NET_AMT ?? 0)
    }));
};

// 拉取单股当日席位明细：买入前五（按 BUY 降序）+ 卖出前五（按 SELL 降序）
// 两个 report 行结构相同（都带 BUY/SELL/NET），一只股可能有多个上榜原因（TRADE_ID），按 TRADE_ID 分组各取前 5
const fetchSeatReport = async (
  dateStr: string,
  code: string,
  reportName: 'RPT_BILLBOARD_DAILYDETAILSBUY' | 'RPT_BILLBOARD_DAILYDETAILSSELL',
  direction: 'buy' | 'sell'
): Promise<TLhbSeatInput[]> => {
  const sortCol = direction === 'buy' ? 'BUY' : 'SELL';
  const { data } = await fetchDatacenter({
    reportName,
    columns: 'SECURITY_CODE,TRADE_ID,OPERATEDEPT_NAME,BUY,SELL,NET',
    sortColumns: sortCol,
    sortTypes: '-1',
    pageSize: '50',
    pageNumber: '1',
    filter: `(TRADE_DATE='${dateStr}')(SECURITY_CODE="${code}")`
  });
  // 按 TRADE_ID 分组，组内按排序列取前 5（接口已全局降序，组内顺序保持）
  const byTradeId = new Map<string, any[]>();
  for (const r of data) {
    if (r.TRADE_ID == null) continue;
    const key = String(r.TRADE_ID);
    if (!byTradeId.has(key)) byTradeId.set(key, []);
    byTradeId.get(key)!.push(r);
  }
  const seats: TLhbSeatInput[] = [];
  for (const [tradeId, rows] of byTradeId) {
    rows.slice(0, 5).forEach((r, i) => {
      seats.push({
        code,
        tradeId,
        direction,
        rank: i + 1,
        deptName: String(r.OPERATEDEPT_NAME ?? ''),
        buy: Number(r.BUY ?? 0),
        sell: Number(r.SELL ?? 0),
        net: Number(r.NET ?? 0)
      });
    });
  }
  return seats;
};

export const fetchLhbSeats = async (dateStr: string, code: string): Promise<TLhbSeatInput[]> => {
  const [buy, sell] = await Promise.all([
    fetchSeatReport(dateStr, code, 'RPT_BILLBOARD_DAILYDETAILSBUY', 'buy'),
    fetchSeatReport(dateStr, code, 'RPT_BILLBOARD_DAILYDETAILSSELL', 'sell')
  ]);
  return [...buy, ...sell];
};

// 拉取某日完整龙虎榜：榜单 + 逐股席位（并发 3、批间 300ms，防东财封 IP）
// 单股席位失败只跳过该股，不影响整日落库
export const fetchLhbDay = async (
  dateStr: string
): Promise<{ stocks: TLhbStockInput[]; seats: TLhbSeatInput[] }> => {
  const stocks = await fetchLhbStocks(dateStr);
  const seatResults = await runWithConcurrency(
    stocks,
    3,
    async stock => {
      try {
        return await fetchLhbSeats(dateStr, stock.code);
      } catch (error) {
        console.error(`[lhb] 席位拉取失败 ${stock.code}:`, error);
        return [] as TLhbSeatInput[];
      }
    },
    300
  );
  return { stocks, seats: seatResults.flat() };
};
