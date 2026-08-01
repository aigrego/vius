// 基本面慢速回填任务：按 fundamentalsAt 升序（null 最前）轮转自填
// 数据源（均为东财，已实际探测可用）：
// - 市值/PE/PB/股本：push2(delay) /api/qt/stock/get（f116 总市值 / f117 流通市值 / f162 PE动 / f167 PB / f84 总股本 / f85 流通股本）
//   ⚠️ f9/f23 在 stock/get 里会被静默丢弃，PE/PB 必须用 f162/f167；secid 市场段 SH=1，SZ/BJ=0
// - 主营业务/主营构成：emweb PC_HSF10 BusinessAnalysis/PageAjax（zyfw 经营范围 / zygcfx 主营构成）
// - 财务指标：emweb PC_HSF10 NewFinanceAnalysis/ZYZBAjaxNew?type=0（最新报告期 EPS/BPS/ROE 等）
// ⚠️ F10 两个接口不支持北交所（返回「股票代码不合法」），BJ 股票只回填市值部分
// 慢速背景任务：并发 2 + 批间 500ms；单股失败记日志继续；无论抓到多少字段都更新 fundamentalsAt，
// 避免某只股票接口长期不可用卡死整个回填队列

import { runWithConcurrency } from '@/lib/eastmoney';
import { parseFullCode } from '@/lib/stock-code';
import { getStocksPendingFundamentals, updateStockFundamentals } from '@/model/StockDict';

const EM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 快照接口主站高频会临时封 IP；基本面不在乎延时行情，优先 delay 站减轻主站压力
const QUOTE_HOSTS = ['https://push2delay.eastmoney.com', 'https://push2.eastmoney.com'];
const F10_HOST = 'https://emweb.securities.eastmoney.com';

// 带超时的 JSON 请求（失败抛出，由调用方决定降级/跳过）
const fetchJson = async (url: string, referer: string, timeoutMs = 5000): Promise<any> => {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': EM_UA, Referer: referer }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
};

const isValidNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

interface QuoteFundamentals {
  marketCap: number | null;
  floatMarketCap: number | null;
  pe: number | null;
  pb: number | null;
  totalShares: number | null;
  floatShares: number | null;
}
// 市值/PE/PB/股本（fltt=2 时 f162/f167 才是原始小数，否则 ×100）
const fetchQuoteFundamentals = async (fullCode: string): Promise<QuoteFundamentals | null> => {
  const { market, code } = parseFullCode(fullCode);
  const secid = `${market === 'SH' ? '1' : '0'}.${code}`;
  const path = `/api/qt/stock/get?secid=${secid}&fltt=2&fields=f58,f84,f85,f116,f117,f162,f167`;
  for (const host of QUOTE_HOSTS) {
    try {
      const json = await fetchJson(`${host}${path}`, 'https://quote.eastmoney.com');
      const d = json?.data;
      if (!d) continue;
      return {
        marketCap: isValidNumber(d.f116) && d.f116 > 0 ? d.f116 : null,
        floatMarketCap: isValidNumber(d.f117) && d.f117 > 0 ? d.f117 : null,
        pe: isValidNumber(d.f162) && d.f162 !== 0 ? d.f162 : null,
        pb: isValidNumber(d.f167) && d.f167 !== 0 ? d.f167 : null,
        totalShares: isValidNumber(d.f84) && d.f84 > 0 ? d.f84 : null,
        floatShares: isValidNumber(d.f85) && d.f85 > 0 ? d.f85 : null
      };
    } catch {
      // 降级下一个源
    }
  }
  return null;
};

// 用 type 而非 interface：无索引签名的 interface 不能赋给 Prisma.InputJsonValue
type CompositionItem = {
  name: string;
  income: number | null;
  incomeRatio: number | null; // 收入占比（0-1）
  grossMargin: number | null; // 毛利率（0-1）
};

type BusinessAnalysis = {
  mainBusiness: { scope: string } | null;
  profitComposition: {
    reportDate: string;
    byIndustry: CompositionItem[];
    byProduct: CompositionItem[];
    byRegion: CompositionItem[];
  } | null;
};

// 主营业务 + 主营构成（zygcfx 的 MAINOP_TYPE：1=按行业 2=按产品 3=按地区；只取最新报告期）
const fetchBusinessAnalysis = async (fullCode: string): Promise<BusinessAnalysis> => {
  const empty: BusinessAnalysis = { mainBusiness: null, profitComposition: null };
  try {
    const json = await fetchJson(
      `${F10_HOST}/PC_HSF10/BusinessAnalysis/PageAjax?code=${fullCode}`,
      'https://emweb.securities.eastmoney.com'
    );
    const scope = json?.zyfw?.[0]?.BUSINESS_SCOPE;
    const mainBusiness = typeof scope === 'string' && scope ? { scope } : null;

    const rows: any[] = Array.isArray(json?.zygcfx) ? json.zygcfx : [];
    const dates = rows.map(r => r?.REPORT_DATE).filter((d): d is string => typeof d === 'string');
    const latest = dates.sort().reverse()[0];
    if (!latest) return { mainBusiness, profitComposition: null };

    const pick = (type: string): CompositionItem[] =>
      rows
        .filter(r => r?.REPORT_DATE === latest && r?.MAINOP_TYPE === type && typeof r?.ITEM_NAME === 'string')
        .map(r => ({
          name: r.ITEM_NAME as string,
          income: isValidNumber(r.MAIN_BUSINESS_INCOME) ? r.MAIN_BUSINESS_INCOME : null,
          incomeRatio: isValidNumber(r.MBI_RATIO) ? r.MBI_RATIO : null,
          grossMargin: isValidNumber(r.GROSS_RPOFIT_RATIO) ? r.GROSS_RPOFIT_RATIO : null
        }));
    return {
      mainBusiness,
      profitComposition: {
        reportDate: latest.slice(0, 10),
        byIndustry: pick('1'),
        byProduct: pick('2'),
        byRegion: pick('3')
      }
    };
  } catch {
    return empty;
  }
}

// 最新报告期财务指标（type=0 按报告期，第一行即最新）
const fetchFinanceIndicators = async (fullCode: string): Promise<Record<string, number | string | null> | null> => {
  try {
    const json = await fetchJson(
      `${F10_HOST}/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?type=0&code=${fullCode}`,
      'https://emweb.securities.eastmoney.com'
    );
    const row = json?.data?.[0];
    if (!row) return null;
    const num = (v: unknown): number | null => (isValidNumber(v) ? v : null);
    return {
      reportDate: typeof row.REPORT_DATE === 'string' ? row.REPORT_DATE.slice(0, 10) : null,
      reportName: typeof row.REPORT_DATE_NAME === 'string' ? row.REPORT_DATE_NAME : null,
      eps: num(row.EPSJB), // 基本每股收益（元）
      bps: num(row.BPS), // 每股净资产（元）
      roe: num(row.ROEJQ), // 净资产收益率-加权（%）
      grossMargin: num(row.XSMLL), // 销售毛利率（%）
      netMargin: num(row.XSJLL), // 销售净利率（%）
      revenue: num(row.TOTALOPERATEREVE), // 营业总收入（元）
      netProfit: num(row.PARENTNETPROFIT), // 归母净利润（元）
      revenueYoy: num(row.TOTALOPERATEREVETZ), // 营收同比（%）
      netProfitYoy: num(row.PARENTNETPROFITTZ) // 归母净利润同比（%）
    };
  } catch {
    return null;
  }
};

// 回填单股：三部分各自独立容错；有任何一部分拿到数据即算成功
const fillOne = async (fullCode: string, market: string): Promise<boolean> => {
  const data: Parameters<typeof updateStockFundamentals>[1] = {};

  const quote = await fetchQuoteFundamentals(fullCode);
  if (quote) {
    data.marketCap = quote.marketCap;
    data.floatMarketCap = quote.floatMarketCap;
  }

  // F10 不支持北交所（探测返回「股票代码不合法」），BJ 只回填市值/估值
  if (market !== 'BJ') {
    const [business, indicators] = await Promise.all([
      fetchBusinessAnalysis(fullCode),
      fetchFinanceIndicators(fullCode)
    ]);
    if (business.mainBusiness) data.mainBusiness = business.mainBusiness;
    if (business.profitComposition) data.profitComposition = business.profitComposition;
    if (quote || indicators) {
      data.financials = {
        pe: quote?.pe ?? null,
        pb: quote?.pb ?? null,
        totalShares: quote?.totalShares ?? null,
        floatShares: quote?.floatShares ?? null,
        latestReport: indicators
      };
    }
  } else if (quote) {
    data.financials = {
      pe: quote.pe,
      pb: quote.pb,
      totalShares: quote.totalShares,
      floatShares: quote.floatShares,
      latestReport: null
    };
  }

  // fundamentalsAt 恒更新（见 updateStockFundamentals），抓不到字段的股票下一轮排到队尾
  await updateStockFundamentals(fullCode, data);
  return Object.keys(data).length > 0;
};

export const syncFundamentals = async (limit: number = 300): Promise<{ scanned: number; filled: number; failed: number }> => {
  const pending = await getStocksPendingFundamentals(limit);
  if (pending.length === 0) {
    console.log('[sync-fundamentals] 没有待回填的股票');
    return { scanned: 0, filled: 0, failed: 0 };
  }
  console.log(`[sync-fundamentals] 本轮回填 ${pending.length} 只（fundamentalsAt 最久的优先）`);

  let filled = 0;
  let failed = 0;
  // 并发 2 + 批间 500ms：东财对高频请求会临时封 IP，慢速回填不赶时间
  await runWithConcurrency(pending, 2, async stock => {
    try {
      const ok = await fillOne(stock.code, stock.market);
      if (ok) filled += 1;
      else {
        failed += 1;
        console.warn(`[sync-fundamentals] ${stock.code}(${stock.name}) 三个接口均未取到数据，仅更新回填时间`);
      }
    } catch (error) {
      // 单股失败不影响整体
      failed += 1;
      console.error(`[sync-fundamentals] ${stock.code}(${stock.name}) 回填失败:`, error);
      // 尽量仍推进队列（写库失败则放弃，下轮重试）
      await updateStockFundamentals(stock.code, {}).catch(() => {});
    }
  }, 500);

  console.log(`[sync-fundamentals] 完成：回填 ${filled} 只，无数据/失败 ${failed} 只`);
  return { scanned: pending.length, filled, failed };
};
