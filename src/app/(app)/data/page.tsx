'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DownloadCloud, Zap, Rss, History } from 'lucide-react';

type SyncType = 'daily' | 'signals' | 'news';

/* 数据管理：手动触发行情/信号/快讯同步与日行情区间补缺。
   定时自动同步由后台 scheduler 执行（见 /cron），本页只做手动入口。 */
export default function DataManagePage() {
  // 手动同步
  const [syncing, setSyncing] = useState<SyncType | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // 日行情区间回补（按天/按周补缺）
  const [backfillFrom, setBackfillFrom] = useState('');
  const [backfillTo, setBackfillTo] = useState('');
  const [backfilling, setBackfilling] = useState(false);

  // 日行情区间回补：只补区间内有缺漏的活跃股，单次最长 31 天
  const runBackfill = async () => {
    try {
      setBackfilling(true);
      setSyncMessage(null);
      const params = new URLSearchParams({ type: 'daily', from: backfillFrom, to: backfillTo });
      const res = await fetch(`/api/ashare/sync?${params.toString()}`, { method: 'POST' });
      const result = await res.json().catch(() => null);
      if (res.status === 401) {
        setSyncMessage('请先登录后再执行同步');
        return;
      }
      if (!res.ok || !result || result.code !== 200) {
        throw new Error(result?.message || '回补失败');
      }
      const d = result.data?.daily;
      setSyncMessage(
        d
          ? `区间回补完成：${d.from}~${d.to} 缺漏 ${d.missing} 只，回补成功 ${d.backfilled} 只`
          : '回补完成'
      );
    } catch (e) {
      setSyncMessage(`回补失败：${(e as Error).message}`);
    } finally {
      setBackfilling(false);
    }
  };

  // 手动同步（浏览器 session 鉴权，401 提示登录）
  const runSync = async (type: SyncType) => {
    try {
      setSyncing(type);
      setSyncMessage(null);
      const res = await fetch(`/api/ashare/sync?type=${type}`, { method: 'POST' });
      const result = await res.json().catch(() => null);
      if (res.status === 401) {
        setSyncMessage('请先登录后再执行同步');
        return;
      }
      if (!res.ok || !result || result.code !== 200) {
        throw new Error(result?.message || '同步失败');
      }
      const d = result.data || {};
      if (type === 'daily' && d.daily) {
        setSyncMessage(`同步完成：清单 ${d.daily.stocks} 只，日线 ${d.daily.dailies} 条，回补 ${d.daily.backfilled} 只`);
      } else if (type === 'signals' && d.signals) {
        setSyncMessage(`信号计算完成：检查 ${d.signals.checked} 只，触发 ${d.signals.signaled} 只`);
      } else if (type === 'news' && d.news) {
        setSyncMessage(`快讯抓取完成：获取 ${d.news.fetched} 条，新增 ${d.news.inserted} 条`);
      } else {
        setSyncMessage('同步完成');
      }
    } catch (e) {
      setSyncMessage(`同步失败：${(e as Error).message}`);
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg">
              🛠️
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">数据管理</h1>
              <p className="text-xs text-fg-3">行情 / 信号 / 快讯 同步管理</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 手动同步 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => runSync('daily')}
                  disabled={syncing !== null}
                >
                  <DownloadCloud className={`w-4 h-4 mr-2 ${syncing === 'daily' ? 'animate-bounce' : ''}`} />
                  {syncing === 'daily' ? '同步中...' : '同步行情'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => runSync('signals')}
                  disabled={syncing !== null}
                >
                  <Zap className={`w-4 h-4 mr-2 ${syncing === 'signals' ? 'animate-pulse' : ''}`} />
                  {syncing === 'signals' ? '计算中...' : '计算信号'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => runSync('news')}
                  disabled={syncing !== null}
                >
                  <Rss className={`w-4 h-4 mr-2 ${syncing === 'news' ? 'animate-pulse' : ''}`} />
                  {syncing === 'news' ? '抓取中...' : '抓取快讯'}
                </Button>
              </div>
              <p className="text-xs text-fg-3">
                「同步行情」只跑清单+快照+新股回补，全量历史回补由后台每日自动进行（需登录）。
              </p>
            </div>
            {/* 日行情区间回补：只补区间内缺漏的活跃股，单次最长 31 天 */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <span className="text-xs text-fg-3">日行情补缺：</span>
              <Input
                type="date"
                value={backfillFrom}
                onChange={(e) => setBackfillFrom(e.target.value)}
                className="h-8 w-[150px] text-xs"
              />
              <span className="text-xs text-fg-3">至</span>
              <Input
                type="date"
                value={backfillTo}
                onChange={(e) => setBackfillTo(e.target.value)}
                className="h-8 w-[150px] text-xs"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={runBackfill}
                disabled={backfilling || syncing !== null || !backfillFrom || !backfillTo}
              >
                <History className={`w-4 h-4 mr-2 ${backfilling ? 'animate-spin' : ''}`} />
                {backfilling ? '回补中...' : '回补区间'}
              </Button>
              <span className="text-xs text-fg-3">按天/按周补缺失日线，单次最长 31 天</span>
            </div>
            {syncMessage && (
              <div className="mt-3 text-sm text-fg-3 border border-border rounded-lg px-3 py-2 bg-bg">
                {syncMessage}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
