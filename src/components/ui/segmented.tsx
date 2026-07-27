'use client';

import * as React from 'react';

/* 胶囊分段控件按钮（筛选器）。选中态使用「淡色底 + 浮起表面」的处理，
   不使用实心填充色。 */
export function SegBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-[3px] text-[12px] font-medium transition-colors"
      style={{
        background: active ? 'var(--surface)' : 'transparent',
        boxShadow: active ? 'var(--shadow-1)' : 'none',
        color: active ? 'var(--fg-1)' : 'var(--fg-3)',
      }}
    >
      {children}
    </button>
  );
}

/* 下划线 tab（主区块切换）。 */
export function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-1 pb-2 text-[13.5px] font-semibold transition-colors"
      style={{ borderColor: active ? 'var(--brand-blue)' : 'transparent', color: active ? 'var(--fg-1)' : 'var(--fg-3)' }}
    >
      {children}
    </button>
  );
}
