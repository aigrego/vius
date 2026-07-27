'use client';

import * as React from 'react';

/* 观微 logo：放大镜 + 镜内行情脉冲线（呼应「观微」——观察细微行情）。
   brand 变体用 --brand-blue 底色（跟随主题 accent）；white 变体用于品牌蓝
   深底上（登录页品牌区）。icon.svg 是同图形的静态 favicon 版本。 */
export function LogoMark({
  size = 24,
  variant = 'brand',
}: {
  size?: number;
  variant?: 'brand' | 'white';
}) {
  const bg = variant === 'brand' ? 'var(--brand-blue)' : 'rgba(255, 255, 255, 0.16)';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill={bg} />
      <polyline
        points="8.5,14.5 11,14.5 12.5,10.5 14.8,16.8 16.2,13 18.5,13"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="13.5" cy="13.5" r="6.8" stroke="#fff" strokeWidth="2" />
      <line x1="18.3" y1="18.3" x2="23" y2="23" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/* Header 用完整 logo：mark + 「观微 vius」文字标。 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="flex flex-none items-center gap-2 whitespace-nowrap">
      <LogoMark size={size} />
      <span className="flex items-baseline gap-1.5">
        <span className="text-[15px] font-bold tracking-tight text-fg-1">观微</span>
        <span className="font-mono text-[15px] font-semibold tracking-tight text-fg-3">vius</span>
      </span>
    </span>
  );
}
