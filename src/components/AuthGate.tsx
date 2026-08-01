'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { HEADER_HEIGHT } from '@/components/Header';

/* 客户端鉴权门：挂载后请求 GET /api/auth/session，
   200 且响应中带 user 才渲染 children，否则跳转 /login；
   session 通过后再拉 /api/auth/permissions：当前路径命中 hidden 的治理路由
   则跳回 /dashboard（/dashboard 本身 hidden 时跳恒可见的 /settings）。
   校验期间渲染全屏骨架（顶栏 + 侧栏 + 内容 shimmer）。 */

function GateSkeleton() {
  return (
    <div className="flex h-screen flex-col bg-bg">
      <div className="flex-none border-b border-border bg-surface" style={{ height: HEADER_HEIGHT }} />
      <div className="flex min-h-0 flex-1">
        <div className="w-[244px] flex-none border-r border-border bg-surface-2" />
        <div className="flex-1 space-y-3 p-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton h-6 rounded-md" style={{ width: `${88 - i * 6}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* 当前路径命中的治理路由（levels 的 key 即治理路由清单，最长前缀匹配；
   /stock/[code] 个股详情页归属 /dashboard；/news /data 依附 /ashare 档）。 */
function governedRouteOf(pathname: string, levels: Record<string, string>): string | null {
  if (pathname.startsWith('/stock')) return '/dashboard';
  if (pathname.startsWith('/news') || pathname.startsWith('/data')) return '/ashare';
  const hit = Object.keys(levels)
    .filter((r) => pathname === r || pathname.startsWith(r + '/'))
    .sort((a, b) => b.length - a.length)[0];
  return hit ?? null;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authed, setAuthed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (cancelled) return;
        if (!res.ok) {
          router.replace('/login');
          return;
        }
        const data = await res.json().catch(() => null);
        // 兼容 { user } 与 { data: { user } } 两种包裹形式
        const user = data?.user ?? data?.data?.user ?? null;
        if (!user) {
          router.replace('/login');
          return;
        }

        // 路由权限守卫：命中 hidden 的治理路由则跳走
        const permRes = await fetch('/api/auth/permissions');
        if (cancelled) return;
        if (permRes.ok) {
          const permJson = await permRes.json().catch(() => null);
          const levels = permJson?.data?.levels as Record<string, string> | undefined;
          if (levels) {
            const route = governedRouteOf(pathname, levels);
            if (route && levels[route] === 'hidden') {
              // /dashboard 也被 hidden 时退到恒可见的 /settings，避免跳转死循环
              router.replace(route === '/dashboard' ? '/settings' : '/dashboard');
              return;
            }
          }
        }
        setAuthed(true);
      } catch {
        if (!cancelled) router.replace('/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  if (!authed) return <GateSkeleton />;
  return <>{children}</>;
}
