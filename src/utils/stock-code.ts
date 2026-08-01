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

/* 展示用完整代码：600000.SH / 301033.SZ / 430047.BJ / 00700.HK。
   与 toDetailCode 的 wallstcn 后缀风格不同（上证用 SH 而非 SS），仅用于界面展示，勿传给外部接口。 */
const DISPLAY_SUFFIX: Record<string, string> = {
  sh: 'SH',
  sz: 'SZ',
  bj: 'BJ',
  hk: 'HK',
};

export function toDisplayCode(code: string, market?: string): string {
  if (code.includes('.')) {
    // 已是完整代码：wallstcn 风格的 SS 归一为 SH
    const [bare = '', suffix = ''] = code.split('.');
    const sfx = suffix.toUpperCase();
    return `${bare}.${sfx === 'SS' ? 'SH' : sfx}`;
  }
  const suffix = market && DISPLAY_SUFFIX[market.toLowerCase()];
  if (suffix) return `${code}.${suffix}`;
  if (code.startsWith('6')) return `${code}.SH`;
  if (code.startsWith('0') || code.startsWith('3')) return `${code}.SZ`;
  if (code.startsWith('8') || code.startsWith('4')) return `${code}.BJ`;
  if (/^\d{5}$/.test(code)) return `${code}.HK`;
  return code;
}
