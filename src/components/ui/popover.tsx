'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/* 原生实现的 Popover（vius 未引入 @radix-ui/react-popover）。
   相对定位容器 + 绝对定位浮层；点击外部 / Escape 关闭。
   API 与 spms 版本保持一致：Popover（受控 open/onOpenChange）、
   PopoverTrigger、PopoverContent（align/sideOffset 常用子集）。 */

interface PopoverCtxValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const PopoverCtx = React.createContext<PopoverCtxValue | null>(null);

export interface PopoverProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Popover({ open, onOpenChange, children }: PopoverProps) {
  const [inner, setInner] = React.useState(false);
  const controlled = open !== undefined;
  const value = controlled ? open : inner;
  const setOpen = React.useCallback(
    (o: boolean) => {
      if (!controlled) setInner(o);
      onOpenChange?.(o);
    },
    [controlled, onOpenChange],
  );
  const rootRef = React.useRef<HTMLSpanElement>(null);

  // 点击容器外部或按 Escape 关闭
  React.useEffect(() => {
    if (!value) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [value, setOpen]);

  return (
    <PopoverCtx.Provider value={{ open: value, setOpen }}>
      <span ref={rootRef} className="relative inline-block">
        {children}
      </span>
    </PopoverCtx.Provider>
  );
}

function PopoverTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const ctx = React.useContext(PopoverCtx);
  if (!ctx) throw new Error('PopoverTrigger 必须放在 <Popover> 内使用');
  const toggle = () => ctx.setOpen(!ctx.open);
  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as { onClick?: (e: React.MouseEvent) => void };
    return React.cloneElement(
      children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>,
      {
        onClick: (e: React.MouseEvent) => {
          childProps.onClick?.(e);
          toggle();
        },
      },
    );
  }
  return (
    <button type="button" onClick={toggle}>
      {children}
    </button>
  );
}

/* 兼容写法：原生实现锚点就是容器本身，直接透传。 */
function PopoverAnchor({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = 'start', sideOffset = 6, style, ...props }, ref) => {
    const ctx = React.useContext(PopoverCtx);
    if (!ctx) throw new Error('PopoverContent 必须放在 <Popover> 内使用');
    if (!ctx.open) return null;
    const alignStyle: React.CSSProperties =
      align === 'end'
        ? { right: 0 }
        : align === 'center'
          ? { left: '50%', transform: 'translateX(-50%)' }
          : { left: 0 };
    return (
      <div
        ref={ref}
        className={cn(
          'absolute top-full z-[2100] max-h-[60vh] overflow-y-auto rounded-[10px] border border-border bg-surface p-1.5 shadow-3 outline-none animate-popIn',
          className,
        )}
        style={{ marginTop: sideOffset, ...alignStyle, ...style }}
        {...props}
      />
    );
  },
);
PopoverContent.displayName = 'PopoverContent';

/* 通用菜单项：状态/优先级等浮层选项共用。 */
export function MenuItem({
  glyph,
  label,
  meta,
  selected,
  onClick,
}: {
  glyph?: React.ReactNode;
  label: React.ReactNode;
  meta?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-fg-1 hover:bg-surface-2"
    >
      {glyph}
      <span className="flex-1 truncate">{label}</span>
      {meta && <span className="text-[11px] text-fg-3">{meta}</span>}
      {selected && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
