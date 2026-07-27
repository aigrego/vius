'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/* 原生实现的 Dialog（vius 未引入 @radix-ui/react-dialog，保持与 spms 相同的
   使用姿势：Dialog 受控 open/onOpenChange，DialogTrigger/DialogClose 通过
   cloneElement 注入点击行为，DialogContent 自带遮罩层）。
   支持 Escape 与点击遮罩关闭。 */

interface DialogCtxValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogCtx = React.createContext<DialogCtxValue | null>(null);

function useDialogCtx(): DialogCtxValue {
  const ctx = React.useContext(DialogCtx);
  if (!ctx) throw new Error('Dialog 子组件必须放在 <Dialog> 内使用');
  return ctx;
}

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
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
  return <DialogCtx.Provider value={{ open: value, setOpen }}>{children}</DialogCtx.Provider>;
}

/* 给子元素注入 onClick（保留子元素原有 onClick）。 */
function injectClick(child: React.ReactNode, handler: () => void): React.ReactNode {
  if (React.isValidElement(child)) {
    const childProps = child.props as { onClick?: (e: React.MouseEvent) => void };
    return React.cloneElement(
      child as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>,
      {
        onClick: (e: React.MouseEvent) => {
          childProps.onClick?.(e);
          handler();
        },
      },
    );
  }
  return (
    <button type="button" onClick={handler}>
      {child}
    </button>
  );
}

function DialogTrigger({ children }: { children: React.ReactNode }) {
  const { setOpen } = useDialogCtx();
  return <>{injectClick(children, () => setOpen(true))}</>;
}

function DialogClose({ children }: { children: React.ReactNode }) {
  const { setOpen } = useDialogCtx();
  return <>{injectClick(children, () => setOpen(false))}</>;
}

/* 兼容 shadcn 写法：原生实现无需 Portal，直接透传。 */
function DialogPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const DialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('fixed inset-0 z-[2000] bg-[rgba(11,18,32,0.5)] backdrop-blur-[4px] animate-fadeIn', className)}
      {...props}
    />
  ),
);
DialogOverlay.displayName = 'DialogOverlay';

const DialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useDialogCtx();

    // Escape 关闭
    React.useEffect(() => {
      if (!open) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [open, setOpen]);

    if (!open) return null;
    return (
      <>
        <DialogOverlay onClick={() => setOpen(false)} />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          className={cn(
            'fixed left-1/2 top-[12vh] z-[2001] w-[min(640px,92vw)] -translate-x-1/2 rounded-xl border border-border bg-surface shadow-4 outline-none animate-popIn',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </>
    );
  },
);
DialogContent.displayName = 'DialogContent';

export { Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent };
