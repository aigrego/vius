'use client';

import * as React from 'react';
import { SWRConfig } from 'swr';
import { readThemePref, applyTheme } from '@/lib/theme';

/* 全局 SWR fetcher：直接返回 JSON 响应体。 */
const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* 客户端全局 Provider（预留扩展位：后续可加 Toast / 全局数据等）。 */
export function Providers({ children }: { children: React.ReactNode }) {
  // 持久化偏好为 'system' 时绑定系统深色模式监听
  // （anti-flash 内联脚本只负责首帧解析）。
  React.useEffect(() => {
    if (readThemePref() === 'system') applyTheme('system');
  }, []);
  return <SWRConfig value={{ fetcher }}>{children}</SWRConfig>;
}
