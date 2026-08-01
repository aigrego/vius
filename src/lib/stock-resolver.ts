import prisma from '@/lib/prisma';
import { fetchRealtimeQuotes } from '@/lib/realtime';
import { toFullCode } from '@/lib/stock-code';
import { ensureStockDict } from '@/model/StockDict';

// 解析结果：新建股票池/持仓记录时由代码自动补全的元信息
// stockCode 为 fullCode（SH600519/HK00700）；market 为大写 SH/SZ/BJ/HK；type 为 stock/etf
export interface ResolvedStock {
  stockCode: string;
  name: string;
  market: string; // SH/SZ/BJ/HK
  type: string; // stock / etf
}

// 从代码前缀推断市场（小写，供 realtime 行情源使用；覆盖 ETF/基金前缀、北交所 920 新号段）
export function inferMarket(code: string): string {
  if (/^920/.test(code)) return 'bj';
  if (/^[659]/.test(code)) return 'sh';
  if (/^[0123]/.test(code)) return 'sz';
  if (/^[48]/.test(code)) return 'bj';
  if (/^\d{5}$/.test(code)) return 'hk';
  return 'us';
}

// 从代码前缀推断类型：沪市 5 开头、深市 1 开头为场内基金/ETF，其余为个股（stock）
function inferType(code: string, market: string): string {
  if ((market === 'sh' && code.startsWith('5')) || (market === 'sz' && code.startsWith('1'))) {
    return 'etf';
  }
  return 'stock';
}

// 由股票代码（用户输入的裸 6 位或港股代码）解析名称/市场/类型：
// 1. 先按 A 股前缀规则转 fullCode 查本地字典 stock_dict（每日同步，离线可用）
// 2. 未命中再走实时行情三源兜底拿名称（覆盖 ETF/港股及清单未收录的新股），命中后懒建字典行
// 都失败返回 null，由调用方决定拒绝还是报错
export async function resolveStock(code: string): Promise<ResolvedStock | null> {
  const fullCode = toFullCode(code);
  const dict = await prisma.stockDict.findUnique({ where: { code: fullCode } });
  if (dict) {
    return { stockCode: dict.code, name: dict.name, market: dict.market, type: dict.type };
  }

  const market = inferMarket(code);
  try {
    const quotes = await fetchRealtimeQuotes([code], [market]);
    const quote = quotes.find(q => q.code.toUpperCase() === code.toUpperCase());
    if (quote?.name) {
      const type = inferType(code, market);
      const resolved: ResolvedStock = {
        stockCode: `${market.toUpperCase()}${code}`,
        name: quote.name,
        market: market.toUpperCase(),
        type
      };
      // 懒建字典行，后续 stock_trade/news_stock 等关联可直接用
      await ensureStockDict({ code: resolved.stockCode, name: resolved.name, market: resolved.market, type });
      return resolved;
    }
  } catch (error) {
    console.warn(`resolveStock: realtime lookup failed for ${code}:`, error);
  }

  return null;
}
