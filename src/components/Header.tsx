'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Settings, Sun } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Logo } from '@/components/Logo';
import { applyTheme } from '@/lib/theme';

export const HEADER_HEIGHT = 52;

/* 会话返回的用户信息（兼容 { user } 与 { data: { user } } 两种包裹形式）。 */
interface SessionUser {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
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

/* 头像：有 avatarUrl 用图片，否则用户名首字符色块。 */
function Avatar({ user, size }: { user: SessionUser | null; size: number }) {
  const name = displayName(user);
  if (user?.avatarUrl) {
    return (
      // 第三方头像外链，不走 next/image 域名白名单
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt={name}
        className="flex-none rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid flex-none place-items-center rounded-full text-white"
      style={{ width: size, height: size, background: 'var(--brand-blue)', fontSize: size * 0.42 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function UserMenu({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const name = displayName(user);
  // 浅色模式开关：初始值读 anti-flash 脚本已写入的 data-theme
  const [light, setLight] = React.useState(
    () => typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'dark',
  );

  const toggleTheme = (next: boolean) => {
    applyTheme(next ? 'light' : 'dark');
    setLight(next);
  };

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
          <Avatar user={user} size={24} />
          <span className="max-w-[120px] truncate text-[13px] font-medium text-fg-1">{name}</span>
          <ChevronDown size={14} className="flex-none text-fg-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent style={{ width: 240 }}>
        {/* 用户卡片：大头像 + 名字 + @username + 角色 */}
        <div className="flex flex-col items-center gap-1 px-3 pb-2.5 pt-3">
          <Avatar user={user} size={48} />
          <div className="mt-1 max-w-full truncate text-[14px] font-semibold text-fg-1">{name}</div>
          {user?.username && (
            <div className="max-w-full truncate text-[12px] text-fg-3">@{user.username}</div>
          )}
          <Badge tone="blue" className="mt-1">
            {user?.role === 'admin' ? '公司管理员' : '成员'}
          </Badge>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/profile')}>
          <Settings size={15} className="flex-none text-fg-3" />
          个人设置
        </DropdownMenuItem>
        {/* 浅色模式开关：用普通行避免点击后菜单自动收起 */}
        <div className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-fg-1">
          <Sun size={15} className="flex-none text-fg-3" />
          <span className="flex-1">浅色模式</span>
          <Switch checked={light} onCheckedChange={toggleTheme} />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-danger">
          <LogOut size={15} className="flex-none" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* 全局 52px 顶栏：左侧 logo，右侧用户菜单（主题开关在菜单内）。 */
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
      className="relative z-[60] flex flex-none items-center gap-3 border-b border-border bg-surface px-4"
      style={{ height: HEADER_HEIGHT }}
    >
      {/* 左：logo */}
      <div className="flex min-w-0 flex-1 items-center">
        <Link href="/stock" className="flex flex-none items-center">
          <Logo size={24} />
        </Link>
      </div>

      {/* 右：用户菜单 */}
      <div className="flex min-w-0 flex-none items-center gap-1.5">
        {loading ? <div className="skeleton h-8 w-[96px] rounded-lg" /> : <UserMenu user={user} />}
      </div>
    </header>
  );
}
