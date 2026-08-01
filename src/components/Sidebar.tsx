'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Database, KeyRound, LayoutGrid, LineChart, ListChecks, Newspaper, Settings, Timer, Trophy, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

/* 左侧 244px 导航栏：行情总览 / 股票池 / 持仓股 / A股总览 / 资讯管理 / 数据管理 / 放量信号 / 龙虎榜，
   底部固定「Agent 接入 / 设置」入口（「定时任务」按权限插入）。
   用 usePathname 高亮当前项（选中态为品牌色淡底 + 品牌色文字）。
   入口可见性按 /api/auth/permissions 的路由权限档过滤：hidden 不显示；
   /news /data 是 /ashare 拆出的子页面，权限档依附 /ashare。 */

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
    href: '/dashboard',
    // /stock/[code] 个股详情页也归属于行情总览
    match: (p) => p.startsWith('/dashboard') || p.startsWith('/stock'),
  },
  {
    icon: <ListChecks size={16} />,
    label: '股票池',
    href: '/pool',
    match: (p) => p === '/pool',
  },
  {
    icon: <Wallet size={16} />,
    label: '持仓股',
    href: '/positions',
    match: (p) => p.startsWith('/positions'),
  },
  {
    icon: <LayoutGrid size={16} />,
    label: 'A股总览',
    href: '/ashare',
    match: (p) => p.startsWith('/ashare'),
  },
  {
    icon: <Newspaper size={16} />,
    label: '资讯管理',
    href: '/news',
    match: (p) => p.startsWith('/news'),
  },
  {
    icon: <Database size={16} />,
    label: '数据中心',
    href: '/data',
    match: (p) => p.startsWith('/data'),
  },
  {
    icon: <Activity size={16} />,
    label: '放量信号',
    href: '/analysis',
    match: (p) => p.startsWith('/analysis'),
  },
  {
    icon: <Trophy size={16} />,
    label: '龙虎榜',
    href: '/lhb',
    match: (p) => p.startsWith('/lhb'),
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

// 「定时任务」入口：插在「设置」前，权限档非 hidden 才可见（admin 恒 rw 自然兼容）
const CRON_ITEM: NavEntry = {
  icon: <Timer size={16} />,
  label: '定时任务',
  href: '/cron',
  match: (p) => p === '/cron',
};

// 拉取当前用户的路由权限档（{ route: level }）；失败返回 null
async function fetchRouteLevels(): Promise<Record<string, string> | null> {
  try {
    const res = await fetch('/api/auth/permissions');
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const levels = json?.data?.levels;
    return levels && typeof levels === 'object' ? (levels as Record<string, string>) : null;
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
  const [levels, setLevels] = React.useState<Record<string, string> | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchRouteLevels().then((l) => {
      if (!cancelled) setLevels(l);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // /news /data 依附 /ashare 权限档（A股总览拆出的子页面）
  const LEVEL_ALIAS: Record<string, string> = { '/news': '/ashare', '/data': '/ashare' };
  // 按权限档过滤：hidden 隐藏入口；levels 未拉到前保持现状全部显示（避免闪烁）
  const visible = (href: string) => !levels || levels[LEVEL_ALIAS[href] ?? href] !== 'hidden';
  const navItems = NAV_ITEMS.filter((item) => visible(item.href));

  // 底部固定入口：Agent 接入（按权限）/ 定时任务（拉到 levels 且非 hidden 才插入）/ 设置（恒显示）
  const bottomItems = [
    ...(visible('/agent') ? [BOTTOM_ITEMS[0]] : []),
    ...(levels && levels['/cron'] !== 'hidden' ? [CRON_ITEM] : []),
    BOTTOM_ITEMS[1],
  ];

  return (
    <aside className="flex w-[244px] flex-none flex-col overflow-hidden border-r border-border bg-surface-2">
      <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-3">
        <div className="mt-1 flex flex-col gap-px">
          {navItems.map((item) => (
            <NavItem key={item.href} entry={item} active={item.match(pathname)} />
          ))}
        </div>
      </nav>
      {/* 底部固定入口：Agent 接入 / 设置（按权限可多一个「定时任务」） */}
      <div className="flex flex-none flex-col gap-px border-t border-border px-3 py-2">
        {bottomItems.map((item) => (
          <NavItem key={item.href} entry={item} active={item.match(pathname)} />
        ))}
      </div>
    </aside>
  );
}
