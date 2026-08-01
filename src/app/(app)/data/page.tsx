'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NewsManageTab } from './news-manage-tab';
import { RealtimeManageTab } from './realtime-manage-tab';
import { LhbManageTab } from './lhb-manage-tab';

type ManageTabKey = 'realtime' | 'news' | 'lhb';

/* 数据中心：行情管理（行情数据源启停 + 手动同步/日行情补缺）、资讯管理、龙虎榜管理，
   tabs 展示（仅 admin 可见，接口侧 requireAdmin 兜底）。
   定时自动同步由后台 scheduler 执行（见 /cron）。 */
export default function DataCenterPage() {
  const [tab, setTab] = useState<ManageTabKey>('realtime');
  const [role, setRole] = useState<string | null>(null);

  // 管理 tab 仅 admin 可见（与设置页管理 tab 同一判定）
  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(json => {
        const user = json?.data?.user ?? json?.user ?? json?.data ?? null;
        if (user?.role) setRole(user.role);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg">
              🗄️
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">数据中心</h1>
              <p className="text-xs text-fg-3">行情 / 信号 / 快讯 同步与数据源管理</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {role === 'admin' ? (
          <>
            <Tabs value={tab} onValueChange={(v) => setTab(v as ManageTabKey)} className="mb-6">
              <TabsList>
                <TabsTrigger value="realtime" className="px-4 py-2 text-sm">行情管理</TabsTrigger>
                <TabsTrigger value="news" className="px-4 py-2 text-sm">资讯管理</TabsTrigger>
                <TabsTrigger value="lhb" className="px-4 py-2 text-sm">龙虎榜管理</TabsTrigger>
              </TabsList>
            </Tabs>

            {tab === 'news' ? (
              <NewsManageTab />
            ) : tab === 'lhb' ? (
              <LhbManageTab />
            ) : (
              <RealtimeManageTab />
            )}
          </>
        ) : role === null ? (
          <div className="py-10 text-center text-[13px] text-fg-3">加载中…</div>
        ) : (
          <div className="py-10 text-center text-[13px] text-fg-3">数据中心仅管理员可用</div>
        )}
      </main>
    </div>
  );
}
