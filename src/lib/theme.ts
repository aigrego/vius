'use client';

/* 主题偏好：Header 主题切换按钮与 app/layout.tsx 的 anti-flash 内联脚本共用。
   持久化在 localStorage('theme')，取值为 'light' | 'dark' | 'system'；
   内联脚本在首帧渲染前解析同一值。默认为 light。 */

export type ThemePref = 'light' | 'dark' | 'system';

export function readThemePref(): ThemePref {
  try {
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    // 隐私模式等场景 —— 落到默认值
  }
  return 'light';
}

export function effectiveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref;
}

let systemListenerBound = false;

function bindSystemListener() {
  if (systemListenerBound) return;
  systemListenerBound = true;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (readThemePref() === 'system') {
      document.documentElement.dataset.theme = effectiveTheme('system');
    }
  });
}

export function applyTheme(pref: ThemePref): void {
  try {
    localStorage.setItem('theme', pref);
  } catch {
    // 主题无法持久化时仅本次生效
  }
  if (pref === 'system') bindSystemListener();
  document.documentElement.dataset.theme = effectiveTheme(pref);
}
