'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, KeyRound, LayoutGrid, LineChart, ListChecks, Settings, Timer, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

/* 左侧 244px 导航栏：行情总览 / 股票池 / 持仓股 / A股总览 / 放量信号，
   底部固定「Agent 接入 / 设置」入口。
   用 usePathname 高亮当前项（选中态为品牌色淡底 + 品牌色文字）。 */

interface NavEntry {
  icon: React.ReactNode;
  label: string;
  href: string;
  // 判断当前路径是否命中该项
  match: (pathname: string) => boolean;
}

const NAV_ITEMS: NavEntry[] = [
  {
    icon: <LineChart size={16} />,
    label: '行情总览',
    href: '/stock',
    match: (p) => p.startsWith('/stock') && !p.startsWith('/stock-pool'),
  },
  {
    icon: <ListChecks size={16} />,
    label: '股票池',
    href: '/stock-pool',
    match: (p) => p === '/stock-pool',
  },
  {
    icon: <Wallet size={16} />,
    label: '持仓股',
    href: '/stock-pool/positions',
    match: (p) => p.startsWith('/stock-pool/positions'),
  },
  {
    icon: <LayoutGrid size={16} />,
    label: 'A股总览',
    href: '/stock-pool/ashare',
    match: (p) => p.startsWith('/stock-pool/ashare'),
  },
  {
    icon: <Activity size={16} />,
    label: '放量信号',
    href: '/stock-pool/analysis',
    match: (p) => p.startsWith('/stock-pool/analysis'),
  },
];

const BOTTOM_ITEMS: NavEntry[] = [
  {
    icon: <KeyRound size={16} />,
    label: 'Agent 接入',
    href: '/agent',
    match: (p) => p === '/agent',
  },
  {
    icon: <Settings size={16} />,
    label: '设置',
    href: '/settings',
    match: (p) => p === '/settings',
  },
];

// 「定时任务」入口：插在「设置」前，仅 admin 可见
const CRON_ITEM: NavEntry = {
  icon: <Timer size={16} />,
  label: '定时任务',
  href: '/cron',
  match: (p) => p === '/cron',
};

// 拉取当前会话角色（兼容 { user } 与 { data: { user } } 两种包裹）；失败返回 null
async function fetchSessionRole(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/session');
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const user = (data?.user ?? data?.data?.user ?? null) as { role?: string | null } | null;
    return user?.role ?? null;
  } catch {
    return null;
  }
}

function NavItem({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <Link
      href={entry.href}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] transition-colors',
        active ? 'font-semibold text-brand-blue' : 'font-medium text-fg-2 hover:bg-surface-2',
      )}
      style={active ? { background: 'var(--brand-blue-tint-8)' } : undefined}
    >
      <span style={{ color: active ? 'var(--brand-blue)' : 'var(--fg-3)' }}>{entry.icon}</span>
      <span className="flex-1 truncate">{entry.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [role, setRole] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchSessionRole().then((r) => {
      if (!cancelled) setRole(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // admin 在「设置」前插入「定时任务」入口；拉取失败/非 admin 不显示
  const bottomItems =
    role === 'admin'
      ? [BOTTOM_ITEMS[0], CRON_ITEM, BOTTOM_ITEMS[1]]
      : BOTTOM_ITEMS;

  return (
    <aside className="flex w-[244px] flex-none flex-col overflow-hidden border-r border-border bg-surface-2">
      <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-3">
        <div className="mt-1 flex flex-col gap-px">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.href} entry={item} active={item.match(pathname)} />
          ))}
        </div>
      </nav>
      {/* 底部固定入口：Agent 接入 / 设置（admin 多一个「定时任务」） */}
      <div className="flex flex-none flex-col gap-px border-t border-border px-3 py-2">
        {bottomItems.map((item) => (
          <NavItem key={item.href} entry={item} active={item.match(pathname)} />
        ))}
      </div>
    </aside>
  );
}
