'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/* 原生实现的 DropdownMenu（vius 未引入 @radix-ui/react-dropdown-menu）。
   与 ui/popover.tsx 同一套容器 + 浮层模式；点击外部 / Escape 关闭，
   点击菜单项后自动收起。 */

interface MenuCtxValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const MenuCtx = React.createContext<MenuCtxValue | null>(null);

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!open) return;
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
  }, [open]);

  return (
    <MenuCtx.Provider value={{ open, setOpen }}>
      <span ref={rootRef} className="relative inline-block">
        {children}
      </span>
    </MenuCtx.Provider>
  );
}

function DropdownMenuTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const ctx = React.useContext(MenuCtx);
  if (!ctx) throw new Error('DropdownMenuTrigger 必须放在 <DropdownMenu> 内使用');
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

export interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, align = 'end', sideOffset = 6, style, ...props }, ref) => {
    const ctx = React.useContext(MenuCtx);
    if (!ctx) throw new Error('DropdownMenuContent 必须放在 <DropdownMenu> 内使用');
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
        role="menu"
        className={cn(
          'absolute top-full z-[2100] max-h-[70vh] min-w-[200px] overflow-y-auto rounded-[10px] border border-border bg-surface p-1.5 shadow-3 outline-none animate-popIn',
          className,
        )}
        style={{ marginTop: sideOffset, ...alignStyle, ...style }}
        {...props}
      />
    );
  },
);
DropdownMenuContent.displayName = 'DropdownMenuContent';

const DropdownMenuItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, onClick, ...props }, ref) => {
    const ctx = React.useContext(MenuCtx);
    return (
      <div
        ref={ref}
        role="menuitem"
        className={cn(
          'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-fg-1 outline-none hover:bg-surface-2',
          className,
        )}
        onClick={(e) => {
          onClick?.(e);
          // 点击菜单项后自动收起
          ctx?.setOpen(false);
        }}
        {...props}
      />
    );
  },
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

const DropdownMenuSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mx-1 my-1 h-px bg-border', className)} {...props} />
  ),
);
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

const DropdownMenuLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-2.5 py-1.5', className)} {...props} />
  ),
);
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
};
