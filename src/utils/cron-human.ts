// cron 表达式 → 人类可读描述（纯函数，客户端/服务端均可用）
// 支持 5 段「分 时 日 月 周」与 6 段「秒 分 时 日 月 周」（node-cron 两种都接受）；
// 只覆盖项目常用模式（整点、每分钟/每 N 分钟/每 N 秒、小时段、周一~周五等），
// 无法识别的模式原样返回表达式，由阅读者自行解读

const DOW_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 星期字段 → 中文；无法识别返回 null（整体回退原样）
function dowText(field: string): string | null {
  if (field === '*') return '';
  const range = field.match(/^(\d)-(\d)$/);
  if (range) {
    const a = DOW_NAMES[Number(range[1])];
    const b = DOW_NAMES[Number(range[2])];
    return a && b ? `${a}~${b}` : null;
  }
  if (/^\d+(,\d+)*$/.test(field)) {
    const days = field.split(',').map(d => DOW_NAMES[Number(d)]);
    if (days.some(d => !d)) return null;
    return days.length === 1 ? `每${days[0]}` : days.join('、');
  }
  return null;
}

const pad = (n: string): string => n.padStart(2, '0');

export function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  let sec: string | null = null;
  let min: string, hour: string, dow: string;
  if (parts.length === 6) {
    [sec, min, hour, , , dow] = parts as [string, string, string, string, string, string];
  } else if (parts.length === 5) {
    [min, hour, , , dow] = parts as [string, string, string, string, string];
  } else {
    return expr;
  }

  const dowPrefix = dowText(dow!);
  if (dowPrefix === null) return expr;

  // 每 N 秒（6 段，秒位 */n，其余时间位 *）
  const secStep = sec?.match(/^\*\/(\d+)$/);
  if (secStep && min === '*' && hour === '*') {
    return join(dowPrefix, `每 ${secStep[1]} 秒`);
  }

  // 每 N 分钟（分位 */n）
  const minStep = min!.match(/^\*\/(\d+)$/);
  if (minStep) {
    if (hour === '*') return join(dowPrefix, `每 ${minStep[1]} 分钟`);
    const range = hour!.match(/^(\d+)-(\d+)$/);
    if (range) return join(dowPrefix, `${range[1]}~${range[2]} 点每 ${minStep[1]} 分钟`);
    if (/^\d+$/.test(hour!)) return join(dowPrefix, `${hour} 点每 ${minStep[1]} 分钟`);
    return expr;
  }

  // 每分钟（分位 *）
  if (min === '*') {
    if (hour === '*') return join(dowPrefix, '每分钟');
    const range = hour!.match(/^(\d+)-(\d+)$/);
    if (range) return join(dowPrefix, `${range[1]}~${range[2]} 点每分钟`);
    if (/^\d+$/.test(hour!)) return join(dowPrefix, `${hour} 点每分钟`);
    return expr;
  }

  // 固定时刻（分/时均为数字）
  if (/^\d+$/.test(min!) && /^\d+$/.test(hour!)) {
    const secNum = sec && /^\d+$/.test(sec) && sec !== '0' ? `:${pad(sec)}` : '';
    return join(dowPrefix, `${pad(hour!)}:${pad(min!)}${secNum}`);
  }

  // 每小时第 N 分
  if (/^\d+$/.test(min!) && hour === '*') {
    return join(dowPrefix, `每小时第 ${min} 分`);
  }

  return expr;
}

function join(dowPrefix: string, text: string): string {
  return dowPrefix ? `${dowPrefix} ${text}` : text;
}
