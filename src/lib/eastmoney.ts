// 东方财富行情接口封装：A股清单、全市场当日快照、单股历史K线
// 东财会拦截裸 node fetch，必须带浏览器 UA；所有请求带 3s 超时 + 失败重试 2 次

const EM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 3000;
const RETRY_TIMES = 2;
const RETRY_INTERVAL_MS = 500;

// 日线数据结构（volume 单位为「手」，1手=100股，保持东财原值不做换算；amount 单位为元）
export interface DailyBar {
  code: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  changePct: number;
  turnover: number | null;
  prevClose?: number | null; // 昨收（快照接口 f18；历史K线由调用方按前一根 close 推导）
}

export interface StockListItem {
  code: string;
  name: string;
  market: string; // sh/sz/bj
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 带超时与重试的 fetch
async function fetchWithRetry(url: string): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_TIMES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Referer': 'https://quote.eastmoney.com',
          'User-Agent': EM_UA
        }
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`EastMoney HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      if (attempt < RETRY_TIMES) await sleep(RETRY_INTERVAL_MS);
    }
  }
  throw lastError || new Error('EastMoney fetch failed');
}

// 并发限速工具：每批 limit 个并发执行，批间休眠 intervalMs，单条失败由调用方在 fn 内自行 catch
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  intervalMs: number = 200
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  for (let start = 0; start < items.length; start += limit) {
    const batch = items.slice(start, start + limit);
    const batchResults = await Promise.all(
      batch.map((item, i) => fn(item, start + i))
    );
    batchResults.forEach((r, i) => {
      results[start + i] = r;
    });
    if (start + limit < items.length) await sleep(intervalMs);
  }
  return results;
}

// 按代码前缀推断市场：6 开头 sh，0/3 开头 sz，4/8 开头 bj
export function inferAStockMarket(code: string): string {
  if (code.startsWith('6')) return 'sh';
  if (code.startsWith('0') || code.startsWith('3')) return 'sz';
  if (code.startsWith('4') || code.startsWith('8')) return 'bj';
  return 'sh';
}

// clist 分页拉取（东财单页实际上限 100 行，即使 pz=200 也只返回 100，必须按 100 分页；
// 以响应里的 total 为终止依据，最后一页不足 100 时收尾）
// push2 主站在高频访问时会临时封 IP（空响应），降级到 push2delay（延时行情，
// 对收盘后的日线同步无影响）；逐页尝试，主站恢复后自动回切
const CLIST_HOSTS = ['https://push2.eastmoney.com', 'https://push2delay.eastmoney.com'];

async function fetchClistAll(fields: string): Promise<any[]> {
  const pageSize = 100;
  const result: any[] = [];
  let page = 1;
  while (true) {
    let json: any = null;
    let lastError: unknown = null;
    for (const host of CLIST_HOSTS) {
      const url =
        `${host}/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2` +
        `&fs=m:1+t:2,m:0+t:6,m:0+t:80&fields=${fields}`;
      try {
        json = await fetchWithRetry(url);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!json) throw lastError instanceof Error ? lastError : new Error('clist 所有源均失败');
    const diff = json?.data?.diff;
    if (!Array.isArray(diff) || diff.length === 0) break;
    result.push(...diff);
    const total = json?.data?.total ?? 0;
    if (result.length >= total || diff.length < pageSize) break;
    page += 1;
    await sleep(200); // 分页间隔，避免触发限流
  }
  return result;
}

// 获取全部沪深京 A 股清单（代码 + 名称 + 市场）
export async function fetchAStockList(): Promise<StockListItem[]> {
  const diff = await fetchClistAll('f12,f14');
  const list: StockListItem[] = [];
  for (const item of diff) {
    const code = item?.f12;
    const name = item?.f14;
    if (typeof code !== 'string' || typeof name !== 'string' || !code || !name) continue;
    list.push({ code, name, market: inferAStockMarket(code) });
  }
  return list;
}

// 东财用字符串 '-' 表示停牌/无数据
function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// 获取全市场当日快照（收盘后 f2 最新价即为收盘价）
export async function fetchDailySnapshot(): Promise<DailyBar[]> {
  // f12代码 f2最新价(收) f3涨跌幅% f5成交量(手) f6成交额 f8换手率 f15最高 f16最低 f17开盘 f18昨收
  const diff = await fetchClistAll('f12,f2,f3,f5,f6,f8,f15,f16,f17,f18');
  const bars: DailyBar[] = [];
  for (const item of diff) {
    const code = item?.f12;
    if (typeof code !== 'string' || !code) continue;
    // 停牌/无数据的股票关键字段为 '-'，直接跳过
    if (!isValidNumber(item.f2) || !isValidNumber(item.f17) || !isValidNumber(item.f15) || !isValidNumber(item.f16)) {
      continue;
    }
    bars.push({
      code,
      open: item.f17,
      close: item.f2,
      high: item.f15,
      low: item.f16,
      volume: isValidNumber(item.f5) ? item.f5 : 0,
      amount: isValidNumber(item.f6) ? item.f6 : 0,
      changePct: isValidNumber(item.f3) ? item.f3 : 0,
      turnover: isValidNumber(item.f8) ? item.f8 : null,
      prevClose: isValidNumber(item.f18) ? item.f18 : null
    });
  }
  return bars;
}

// K线接口镜像站（主站高频访问会被临时封 IP，依次降级到编号镜像与 delay 站）
const KLINE_HOSTS = [
  'https://push2his.eastmoney.com',
  'https://1.push2his.eastmoney.com',
  'https://48.push2his.eastmoney.com',
  'https://90.push2his.eastmoney.com',
  'https://push2delay.eastmoney.com'
];

// 腾讯日K兜底源（东财封 IP 时使用）：无成交额与换手率字段，
// amount 记 0（筹码分布会用 (high+low+close)/3 兜底均价），turnover 记 null
async function fetchHistoryKlineTencent(
  code: string,
  market: string,
  limit: number
): Promise<(DailyBar & { date: string })[]> {
  const symbol = `${market}${code}`;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${limit},qfq`;
  const json = await fetchWithRetry(url);
  const data = json?.data?.[symbol];
  const klines = data?.qfqday ?? data?.day;
  if (!Array.isArray(klines)) return [];

  const bars: (DailyBar & { date: string })[] = [];
  for (const item of klines) {
    if (!Array.isArray(item) || item.length < 6) continue;
    const [date, open, close, high, low, volume] = item;
    const o = parseFloat(open), c = parseFloat(close), h = parseFloat(high), l = parseFloat(low);
    if (typeof date !== 'string' || [o, c, h, l].some(v => !Number.isFinite(v))) continue;
    bars.push({
      code,
      date,
      open: o,
      close: c,
      high: h,
      low: l,
      volume: parseFloat(volume) || 0,
      amount: 0,
      changePct: 0, // 腾讯源无涨跌幅，落库后由快照数据覆盖当日值；历史值不参与信号判断
      turnover: null
    });
  }
  return bars;
}

// 获取单股历史日K（前复权），返回按日期升序
export async function fetchHistoryKline(
  code: string,
  market: string,
  limit: number = 250
): Promise<(DailyBar & { date: string })[]> {
  // secid 市场段：sh/bj=1，sz=0
  const secid = `${market === 'sz' ? '0' : '1'}.${code}`;
  // fields2: f51日期 f52开 f53收 f54高 f55低 f56成交量(手) f57成交额 f59涨跌幅 f61换手率
  const path =
    `/api/qt/stock/kline/get?secid=${secid}` +
    `&klt=101&fqt=1&lmt=${limit}&end=20500101` +
    `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f59,f61`;
  for (const host of KLINE_HOSTS) {
    try {
      const json = await fetchWithRetry(`${host}${path}`);
      const klines = json?.data?.klines;
      if (Array.isArray(klines) && klines.length > 0) {
        return parseEmKlines(code, klines);
      }
      // delay 站 kline 接口恒返回空数组，继续尝试下一个源
    } catch {
      // 继续尝试下一个源
    }
  }
  // 东财全源不可用，降级腾讯
  return fetchHistoryKlineTencent(code, market, limit);
}

// 解析东财 klines 逗号分隔行
function parseEmKlines(code: string, klines: string[]): (DailyBar & { date: string })[] {
  const bars: (DailyBar & { date: string })[] = [];
  for (const line of klines) {
    if (typeof line !== 'string') continue;
    const parts = line.split(',');
    if (parts.length < 9) continue;
    const date = parts[0]!;
    const open = parseFloat(parts[1]!);
    const close = parseFloat(parts[2]!);
    const high = parseFloat(parts[3]!);
    const low = parseFloat(parts[4]!);
    if ([open, close, high, low].some(v => !Number.isFinite(v))) continue;
    const turnover = parseFloat(parts[8]!);
    bars.push({
      code,
      date,
      open,
      close,
      high,
      low,
      volume: parseFloat(parts[5]!) || 0,
      amount: parseFloat(parts[6]!) || 0,
      changePct: parseFloat(parts[7]!) || 0,
      turnover: Number.isFinite(turnover) ? turnover : null
    });
  }
  return bars;
}
