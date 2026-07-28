'use client';

/* 涨跌配色偏好：设置页「通用-涨跌配色」与 app/layout.tsx 的 anti-flash 内联脚本共用。
   持久化在 localStorage('vius-prefs') 的 upColor 字段，取值为
   'red'（红涨绿跌，默认）| 'green'（绿涨红跌）；
   内联脚本在首帧渲染前解析同一值，置 documentElement.dataset.upColor。 */

export type UpColorPref = 'red' | 'green';

const PREFS_KEY = 'vius-prefs';

export function readUpColorPref(): UpColorPref {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const prefs = JSON.parse(raw);
      if (prefs.upColor === 'green' || prefs.upColor === 'red') return prefs.upColor;
    }
  } catch {
    // 隐私模式 / JSON 损坏等场景 —— 落到默认值
  }
  return 'red';
}

/* 只翻转 CSS 变量，不负责持久化（upColor 由设置页随 vius-prefs 整体写回） */
export function applyUpColor(pref: UpColorPref): void {
  if (pref === 'green') {
    document.documentElement.dataset.upColor = 'green';
  } else {
    delete document.documentElement.dataset.upColor;
  }
}
