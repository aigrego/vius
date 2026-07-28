import prisma from '@/lib/prisma';
import { fetchRealtimeQuotes } from '@/lib/realtime';

// 解析结果：新建股票池/持仓记录时由代码自动补全的元信息
export interface ResolvedStock {
  code: string;
  name: string;
  market: string; // sh/sz/bj/hk/us
  type: string; // individual / etf
}

// 从代码前缀推断市场（比 realtime.ts 的兜底更全：覆盖 ETF/基金前缀、北交所 920 新号段）
export function inferMarket(code: string): string {
  if (/^920/.test(code)) return 'bj';
  if (/^[659]/.test(code)) return 'sh';
  if (/^[0123]/.test(code)) return 'sz';
  if (/^[48]/.test(code)) return 'bj';
  if (/^\d{5}$/.test(code)) return 'hk';
  return 'us';
}

// 从代码前缀推断类型：沪市 5 开头、深市 1 开头为场内基金/ETF
function inferType(code: string, market: string): string {
  if ((market === 'sh' && code.startsWith('5')) || (market === 'sz' && code.startsWith('1'))) {
    return 'etf';
  }
  return 'individual';
}

// 由股票代码解析名称/市场/类型：
// 1. 先查本地 A 股清单 stock_basic（每日同步，离线可用）
// 2. 未命中再走实时行情三源兜底拿名称（覆盖 ETF/港美股及清单未收录的新股）
// 都失败返回 null，由调用方决定拒绝还是报错
export async function resolveStock(code: string): Promise<ResolvedStock | null> {
  const basic = await prisma.stockBasic.findUnique({ where: { code } });
  if (basic) {
    return { code, name: basic.name, market: basic.market, type: 'individual' };
  }

  const market = inferMarket(code);
  try {
    const quotes = await fetchRealtimeQuotes([code], [market]);
    const quote = quotes.find(q => q.code.toUpperCase() === code.toUpperCase());
    if (quote?.name) {
      return { code, name: quote.name, market, type: inferType(code, market) };
    }
  } catch (error) {
    console.warn(`resolveStock: realtime lookup failed for ${code}:`, error);
  }

  return null;
}
