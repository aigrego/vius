'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Moon, Sun } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { applyTheme } from '@/lib/theme';

export const HEADER_HEIGHT = 52;

/* 会话返回的用户信息（兼容 { user } 与 { data: { user } } 两种包裹形式）。 */
interface SessionUser {
  name?: string | null;
  username?: string | null;
  email?: string | null;
}

async function fetchSessionUser(): Promise<SessionUser | null> {
  try {
    const res = await fetch('/api/auth/session');
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return (data?.user ?? data?.data?.user ?? null) as SessionUser | null;
  } catch {
    return null;
  }
}

function displayName(user: SessionUser | null): string {
  if (!user) return '用户';
  return user.name || user.username || user.email || '用户';
}

/* 明暗主题切换按钮：初始值读 anti-flash 脚本已写入的 data-theme。 */
function ThemeToggle() {
  const [light, setLight] = React.useState(
    () => typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'dark',
  );

  const toggle = () => {
    const next = !light;
    applyTheme(next ? 'light' : 'dark');
    setLight(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={light ? '切换到深色模式' : '切换到浅色模式'}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-surface-2"
    >
      {light ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}

function UserMenu({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const name = displayName(user);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 退出接口失败也照常回登录页
    }
    router.replace('/login');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-8 items-center gap-2 rounded-lg px-1.5 hover:bg-surface-2">
          {/* 用户名首字符头像块 */}
          <span
            className="grid h-6 w-6 flex-none place-items-center rounded-[6px] text-[12px] font-semibold text-white"
            style={{ background: 'var(--brand-blue)' }}
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="max-w-[120px] truncate text-[13px] font-medium text-fg-1">{name}</span>
          <ChevronDown size={14} className="flex-none text-fg-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent style={{ width: 208 }}>
        <DropdownMenuLabel>
          <div className="truncate text-[13px] font-semibold text-fg-1">{name}</div>
          {user?.email && <div className="truncate text-[11.5px] text-fg-3">{user.email}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-danger">
          <LogOut size={15} className="flex-none" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* 全局 52px 顶栏：左侧「观微 vius」logo，右侧主题切换 + 用户菜单。 */
export function Header() {
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    fetchSessionUser().then((u) => {
      if (cancelled) return;
      setUser(u);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header
      className="relative z-30 flex flex-none items-center gap-3 border-b border-border bg-surface px-4"
      style={{ height: HEADER_HEIGHT }}
    >
      {/* 左：logo 文字 */}
      <div className="flex min-w-0 flex-1 items-center">
        <Link href="/stock" className="flex flex-none items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-[15px] font-bold tracking-tight text-fg-1">观微</span>
          <span className="font-mono text-[15px] font-semibold tracking-tight text-fg-3">vius</span>
        </Link>
      </div>

      {/* 右：主题切换 + 用户菜单 */}
      <div className="flex min-w-0 flex-none items-center gap-1.5">
        <ThemeToggle />
        {loading ? <div className="skeleton h-8 w-[96px] rounded-lg" /> : <UserMenu user={user} />}
      </div>
    </header>
  );
}
