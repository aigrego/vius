// 外部工具放量筛选 CSV 解析（导入 stock_signal 用）
// 样例头：代码,名称,收盘价,涨跌幅%,近一年最高价,高点日期,回撤%,放量倍数,当日量(万股),20日均量(万股)
// 代码兼容三种写法：sh/sz/bj 小写前缀（sh688369）、fullCode（SH688369）、6 位裸码（按号段推断市场）

import { isAShareCode, isAShareFullCode, toFullCode } from '@/lib/stock-code';

export interface ImportedVolumeRow {
  fullCode: string;
  close: number | null;
  changePct: number | null;
  volumeRatio: number | null;
  drawdown: number | null; // 回撤%（负值）
  yearHigh: number | null; // 近一年最高价
  highDate: string | null; // 高点日期
  dayVolume: number | null; // 当日量（万股）
  avgVolume20: number | null; // 20 日均量（万股）
}

// 表头名 → 行字段（缺失的可选列给 null；代码/收盘价/放量倍数为必需列）
const HEADER_MAP: Record<string, keyof Omit<ImportedVolumeRow, 'fullCode'>> = {
  '收盘价': 'close',
  '涨跌幅%': 'changePct',
  '放量倍数': 'volumeRatio',
  '回撤%': 'drawdown',
  '近一年最高价': 'yearHigh',
  '高点日期': 'highDate',
  '当日量(万股)': 'dayVolume',
  '20日均量(万股)': 'avgVolume20',
};

// 简单 CSV 行解析：处理双引号包裹字段（字段内可能有逗号/千分位）
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

const toNum = (s: string | undefined): number | null => {
  if (!s) return null;
  const v = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
};

// 代码归一为 fullCode（SH/SZ/BJ 前缀大写）；无法识别返回 null
export function normalizeImportedCode(raw: string): string | null {
  const s = raw.trim();
  const prefixed = s.match(/^(sh|sz|bj)\s*(\d{6})$/i);
  if (prefixed) return toFullCode(prefixed[2]!, prefixed[1]!.toUpperCase());
  if (isAShareFullCode(s.toUpperCase())) return s.toUpperCase();
  if (isAShareCode(s)) return toFullCode(s);
  return null;
}

export function parseVolumeCsv(csv: string): { rows: ImportedVolumeRow[]; invalid: number } {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { rows: [], invalid: 0 };

  const header = parseCsvLine(lines[0]!);
  const codeIdx = header.indexOf('代码');
  const colIdx = new Map<keyof Omit<ImportedVolumeRow, 'fullCode'>, number>();
  header.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key) colIdx.set(key, i);
  });
  // 缺必需列直接按 0 行处理（调用方报「无法识别文件格式」）
  if (codeIdx < 0 || !colIdx.has('close') || !colIdx.has('volumeRatio')) {
    return { rows: [], invalid: 0 };
  }

  const rows: ImportedVolumeRow[] = [];
  let invalid = 0;
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const fullCode = normalizeImportedCode(cells[codeIdx] ?? '');
    if (!fullCode) {
      invalid++;
      continue;
    }
    const get = (key: keyof Omit<ImportedVolumeRow, 'fullCode'>) => {
      const idx = colIdx.get(key);
      return idx == null ? undefined : cells[idx];
    };
    rows.push({
      fullCode,
      close: toNum(get('close')),
      changePct: toNum(get('changePct')),
      volumeRatio: toNum(get('volumeRatio')),
      drawdown: toNum(get('drawdown')),
      yearHigh: toNum(get('yearHigh')),
      highDate: get('highDate') || null,
      dayVolume: toNum(get('dayVolume')),
      avgVolume20: toNum(get('avgVolume20')),
    });
  }
  return { rows, invalid };
}
