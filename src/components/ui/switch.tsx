'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/* 受控开关（原生 button 实现，token 配色）。
   开 = --brand-blue，关 = --border；disabled 降透明度并禁点。 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[40px] flex-none items-center rounded-full transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
      style={{ background: checked ? 'var(--brand-blue)' : 'var(--border)' }}
    >
      <span
        className="inline-block h-[18px] w-[18px] rounded-full bg-white shadow-1 transition-transform"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(2px)' }}
      />
    </button>
  );
}
