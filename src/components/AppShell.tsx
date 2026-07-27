'use client';

import * as React from 'react';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';

/* 工作台骨架：顶部 52px Header + 左侧 244px Sidebar + 路由主区域。
   鉴权由 AuthGate 负责，AppShell 只做布局。 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
