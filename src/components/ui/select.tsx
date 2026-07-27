'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/* 受控 Select（简单原生实现：容器 + 绝对定位选项浮层，复用 token 样式）。
   - Select：受控 value/onValueChange，管理展开状态
   - SelectTrigger：显示当前选中项的文案（选项通过 context 注册 label，
     关闭态也能正确回显）
   - SelectContent：选项浮层（始终挂载、关闭时 hidden，保证 label 注册）
   - SelectItem：value + children（children 即回显文案） */

interface SelectCtxValue {
  value?: string;
  onValueChange?: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  labels: Map<string, React.ReactNode>;
  registerLabel: (value: string, label: React.ReactNode) => void;
}

const SelectCtx = React.createContext<SelectCtxValue | null>(null);

function useSelectCtx(): SelectCtxValue {
  const ctx = React.useContext(SelectCtx);
  if (!ctx) throw new Error('Select 子组件必须放在 <Select> 内使用');
  return ctx;
}

export interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

function Select({ value, onValueChange, children }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const labelsRef = React.useRef<Map<string, React.ReactNode>>(new Map());
  // 仅用于 label 注册后触发 trigger 重渲染
  const [, bump] = React.useReducer((x: number) => x + 1, 0);

  const registerLabel = React.useCallback((v: string, label: React.ReactNode) => {
    // label 未变化时不触发重渲染（SelectItem 的注册 effect 依赖 ctx，
    // 否则 bump → 重渲染 → 新 ctx → 再注册 会形成死循环）
    if (labelsRef.current.get(v) === label) return;
    labelsRef.current.set(v, label);
    bump();
  }, []);

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
    <SelectCtx.Provider
      value={{ value, onValueChange, open, setOpen, labels: labelsRef.current, registerLabel }}
    >
      <div ref={rootRef} className="relative inline-block">
        {children}
      </div>
    </SelectCtx.Provider>
  );
}

export interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  placeholder?: string;
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, placeholder = '请选择', children, ...props }, ref) => {
    const ctx = useSelectCtx();
    const label = ctx.value !== undefined ? ctx.labels.get(ctx.value) : undefined;
    return (
      <button
        type="button"
        ref={ref}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-3 text-[13px] text-fg-1 outline-none transition-colors focus-visible:border-brand-blue focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:opacity-50',
          className,
        )}
        onClick={() => ctx.setOpen(!ctx.open)}
        {...props}
      >
        <span className={cn('truncate', label == null && 'text-fg-3')}>
          {children ?? label ?? placeholder}
        </span>
        <ChevronDown size={14} className="flex-none text-fg-3" />
      </button>
    );
  },
);
SelectTrigger.displayName = 'SelectTrigger';

const SelectContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, style, ...props }, ref) => {
    const ctx = useSelectCtx();
    return (
      <div
        ref={ref}
        className={cn(
          'absolute left-0 top-full z-[2100] mt-1.5 max-h-[60vh] min-w-full overflow-y-auto rounded-[10px] border border-border bg-surface p-1.5 shadow-3 outline-none animate-popIn',
          !ctx.open && 'hidden',
          className,
        )}
        style={style}
        {...props}
      />
    );
  },
);
SelectContent.displayName = 'SelectContent';

export interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, value, children, ...props }, ref) => {
    const ctx = useSelectCtx();
    // 注册 value → 文案，供关闭态的 trigger 回显
    React.useEffect(() => {
      ctx.registerLabel(value, children);
    }, [ctx, value, children]);
    const selected = ctx.value === value;
    return (
      <div
        ref={ref}
        role="option"
        aria-selected={selected}
        className={cn(
          'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-fg-1 hover:bg-surface-2',
          selected && 'font-medium',
          className,
        )}
        onClick={() => {
          ctx.onValueChange?.(value);
          ctx.setOpen(false);
        }}
        {...props}
      >
        <span className="flex-1 truncate">{children}</span>
        {selected && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
    );
  },
);
SelectItem.displayName = 'SelectItem';

export { Select, SelectTrigger, SelectContent, SelectItem };
