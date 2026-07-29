// 交易日相关的日期工具（服务端任务用）

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 区间内的工作日列表（YYYY-MM-DD 升序；仅跳过周末，节假日未处理——
// 空数据日由调用方兜底：龙虎榜空榜跳过写入，日行情 kline 本就无该日 bar）
export const tradingDaysBetween = (from: string, to: string): string[] => {
  const days: string[] = [];
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return days;
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
};

// 解析并校验区间参数：合法返回 { from, to }（from ≤ to、跨度 ≤ maxDays），否则返回错误消息
export const parseDateRange = (
  from: string | null,
  to: string | null,
  maxDays: number
): { from: string; to: string } | { error: string } => {
  if (!from || !to) return { error: 'from/to 均需指定（YYYY-MM-DD）' };
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return { error: 'from/to 格式应为 YYYY-MM-DD' };
  if (from > to) return { error: 'from 不能晚于 to' };
  const spanDays = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000;
  if (spanDays > maxDays) return { error: `单次区间最长 ${maxDays} 天` };
  return { from, to };
};
