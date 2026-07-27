'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { HEADER_HEIGHT } from '@/components/Header';

/* 客户端鉴权门：挂载后请求 GET /api/auth/session，
   200 且响应中带 user 才渲染 children，否则跳转 /login；
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

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
        if (user) {
          setAuthed(true);
        } else {
          router.replace('/login');
        }
      } catch {
        if (!cancelled) router.replace('/login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!authed) return <GateSkeleton />;
  return <>{children}</>;
}
