// fullCode 约定：市场前缀大写 + 数字代码，如 SH600519 / SZ000001 / BJ430047 / HK00700
// stock_dict 主键、stock_trade/news_stock/plate_stock/watchlist/position/stock_signal 的关联键都用它。
// 外部接口契约（/api/stocks/real 的 prod_code、选股宝 iframe）仍是 wallstcn 后缀风格 600519.SS，用 toExternalCode 转换。

// A 股代码前缀推断市场：6→SH、0/3→SZ、4/8/920→BJ（与 eastmoney.inferAStockMarket 规则一致）
export const inferAShareMarket = (code: string): 'SH' | 'SZ' | 'BJ' => {
  if (/^(60|68|90)/.test(code)) return 'SH';
  if (/^(00|30|20)/.test(code)) return 'SZ';
  return 'BJ'; // 4/8/920 号段
};

// 市场写法规范化：小写/ss 兼容 → SH/SZ/BJ/HK 大写
export const normalizeMarket = (market: string): string => {
  const m = market.toUpperCase();
  return m === 'SS' ? 'SH' : m;
};

// 裸代码 + 市场 → fullCode；market 缺省时按 A 股前缀规则推断
export const toFullCode = (code: string, market?: string): string => {
  const m = market ? normalizeMarket(market) : inferAShareMarket(code);
  return `${m}${code}`;
};

// fullCode → { market, code }（无法解析时 market 为空串）
export const parseFullCode = (fullCode: string): { market: string; code: string } => {
  const m = fullCode.match(/^([A-Z]{2})(\w+)$/);
  return m ? { market: m[1]!, code: m[2]! } : { market: '', code: fullCode };
};

// fullCode → wallstcn 后缀风格（600519.SS / 00700.HK），/api/stocks/real 与选股宝图表用；SH→SS 保持兼容
export const toExternalCode = (fullCode: string): string => {
  const { market, code } = parseFullCode(fullCode);
  const suffix = market === 'SH' ? 'SS' : market;
  return suffix ? `${code}.${suffix}` : fullCode;
};

// 裸代码是否为 A 股 6 位数字
export const isAShareCode = (code: string): boolean => /^\d{6}$/.test(code);

// fullCode 是否为 A 股（SH/SZ/BJ）
export const isAShareFullCode = (fullCode: string): boolean => /^(SH|SZ|BJ)\d{6}$/.test(fullCode);
