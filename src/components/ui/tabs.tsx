'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/* Tabs（受控 value/onValueChange；不含 TabsContent —— 调用方根据 value
   手动条件渲染面板）。选中态沿用 segmented 的「浮起表面」样式。 */

interface TabsCtxValue {
  value: string;
  onValueChange?: (value: string) => void;
}

const TabsCtx = React.createContext<TabsCtxValue | null>(null);

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  onValueChange?: (value: string) => void;
}

function Tabs({ value, onValueChange, className, ...props }: TabsProps) {
  return (
    <TabsCtx.Provider value={{ value, onValueChange }}>
      <div className={className} {...props} />
    </TabsCtx.Provider>
  );
}

const TabsList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 rounded-lg bg-surface-2 p-1',
        className,
      )}
      {...props}
    />
  ),
);
TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, ...props }, ref) => {
    const ctx = React.useContext(TabsCtx);
    if (!ctx) throw new Error('TabsTrigger 必须放在 <Tabs> 内使用');
    const active = ctx.value === value;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-[5px] text-[12.5px] font-medium transition-colors',
          className,
        )}
        style={{
          background: active ? 'var(--surface)' : 'transparent',
          boxShadow: active ? 'var(--shadow-1)' : 'none',
          color: active ? 'var(--fg-1)' : 'var(--fg-3)',
        }}
        onClick={() => ctx.onValueChange?.(value)}
        {...props}
      />
    );
  },
);
TabsTrigger.displayName = 'TabsTrigger';

export { Tabs, TabsList, TabsTrigger };
