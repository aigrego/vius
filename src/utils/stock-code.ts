/* 股票代码 → /stock/[code] 统一详情页的完整代码（wallstcn 风格后缀）。
   market 缺失时按 A 股代码前缀推断（6→SS，0/3→SZ，8/4→BJ，5 位数字→HK）。 */

const MARKET_SUFFIX: Record<string, string> = {
  sh: 'SS',
  sz: 'SZ',
  bj: 'BJ',
  hk: 'HK',
};

export function toDetailCode(code: string, market?: string): string {
  if (code.includes('.')) return code; // 已是完整代码
  const suffix = market && MARKET_SUFFIX[market.toLowerCase()];
  if (suffix) return `${code}.${suffix}`;
  if (code.startsWith('6')) return `${code}.SS`;
  if (code.startsWith('0') || code.startsWith('3')) return `${code}.SZ`;
  if (code.startsWith('8') || code.startsWith('4')) return `${code}.BJ`;
  if (/^\d{5}$/.test(code)) return `${code}.HK`;
  return `${code}.US`;
}
