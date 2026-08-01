'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { DownloadCloud, Zap, Rss, History } from 'lucide-react';

/* 数据中心「行情管理」tab（仅 admin 渲染；接口侧同样由 requireAdmin 兜底）。
   行情数据源启停（realtime_source 表，key 标识解析器，按 sort 升序只循环启用源，
   前一个失败自动降级下一个；服务端 10s 进程缓存，启停最长 10 秒后生效）
   + 手动同步（行情/信号/快讯）与日行情区间补缺（布局对齐龙虎榜管理 tab）。 */

interface RealtimeSourceItem {
  id: number;
  key: string;
  name: string;
  sort: number;
  description: string | null;
  enabled: boolean;
}

type SyncType = 'daily' | 'signals' | 'news';

const KEY_LABELS: Record<string, string> = {
  sina: '新浪财经',
  tencent: '腾讯财经',
  eastmoney: '东方财富'
};

export function RealtimeManageTab() {
  const [sources, setSources] = React.useState<RealtimeSourceItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // 手动同步
  const [syncing, setSyncing] = React.useState<SyncType | null>(null);
  const [syncMessage, setSyncMessage] = React.useState<string | null>(null);

  // 日行情区间回补（按天/按周补缺）
  const [bfFrom, setBfFrom] = React.useState('');
  const [bfTo, setBfTo] = React.useState('');
  const [backfilling, setBackfilling] = React.useState(false);

  const fetchAll = React.useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/stocks/manage/sources');
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.message || '获取数据源失败');
      setSources(json.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  // 本地日期 YYYY-MM-DD（n 天前）
  const localDateStr = (nDaysAgo = 0): string => {
    const d = new Date(Date.now() - nDaysAgo * 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const handleToggle = async (s: RealtimeSourceItem) => {
    const res = await fetch(`/api/stocks/manage/sources/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !s.enabled })
    });
    const json = await res.json();
    if (json.code !== 200) {
      alert(json.message || '操作失败');
      return;
    }
    flash(`${s.enabled ? '已停用' : '已启用'}「${s.name}」（最长 10 秒后生效）`);
    await fetchAll();
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

  // 日行情区间回补：只补区间内有缺漏的活跃股，单次最长 31 天
  const runBackfill = async () => {
    try {
      setBackfilling(true);
      setSyncMessage(null);
      const params = new URLSearchParams({ type: 'daily', from: bfFrom, to: bfTo });
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

  if (error) {
    return <div className="py-10 text-center text-[13px] text-danger">{error}</div>;
  }
  if (!sources) {
    return <div className="py-10 text-center text-[13px] text-fg-3">加载中…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 标题 */}
      <div>
        <h2 className="m-0 text-[16px] font-semibold text-fg-1">行情数据源</h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          实时行情按顺序只请求启用源，前一个失败/超时自动降级下一个；生产环境可停用不可达的源避免空等
        </p>
      </div>

      {notice && <div className="text-[12.5px] text-success">{notice}</div>}

      {/* 数据源列表 */}
      <div>
        <h3 className="mb-2 text-[14px] font-semibold text-fg-1">数据源列表</h3>
        <div className="flex flex-col gap-3">
          {sources.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-fg-1">{s.name}</span>
                    <Badge tone="blue">{KEY_LABELS[s.key] ?? s.key}</Badge>
                    <Badge tone={s.enabled ? 'success' : 'neutral'}>{s.enabled ? '启用' : '停用'}</Badge>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => handleToggle(s)}>
                    {s.enabled ? '停用' : '启用'}
                  </Button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-3">
                  <span>降级顺序: {s.sort}</span>
                  {s.description && <span className="font-mono">{s.description}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 手动同步（定时自动同步见 /cron，本区只做手动入口） */}
      <div>
        <h3 className="mb-2 text-[14px] font-semibold text-fg-1">手动同步</h3>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => runSync('daily')}
                  disabled={syncing !== null || backfilling}
                >
                  <DownloadCloud className={`w-4 h-4 mr-2 ${syncing === 'daily' ? 'animate-bounce' : ''}`} />
                  {syncing === 'daily' ? '同步中...' : '同步行情'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => runSync('signals')}
                  disabled={syncing !== null || backfilling}
                >
                  <Zap className={`w-4 h-4 mr-2 ${syncing === 'signals' ? 'animate-pulse' : ''}`} />
                  {syncing === 'signals' ? '计算中...' : '计算信号'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => runSync('news')}
                  disabled={syncing !== null || backfilling}
                >
                  <Rss className={`w-4 h-4 mr-2 ${syncing === 'news' ? 'animate-pulse' : ''}`} />
                  {syncing === 'news' ? '抓取中...' : '抓取快讯'}
                </Button>
              </div>
              <p className="text-xs text-fg-3">
                「同步行情」只跑清单+快照+新股回补，全量历史回补由后台每日自动进行（需登录）。
              </p>
            </div>
            {syncMessage && (
              <div className="mt-3 text-sm text-fg-3 border border-border rounded-lg px-3 py-2 bg-bg">
                {syncMessage}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 日行情补缺（只补区间内有缺漏的活跃股，单次最长 31 天） */}
      <div>
        <h3 className="mb-2 text-[14px] font-semibold text-fg-1">日行情补缺</h3>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={bfFrom}
                onChange={e => setBfFrom(e.target.value)}
                className="h-8 w-[150px] text-[12.5px]"
              />
              <span className="text-[12.5px] text-fg-3">至</span>
              <Input
                type="date"
                value={bfTo}
                onChange={e => setBfTo(e.target.value)}
                className="h-8 w-[150px] text-[12.5px]"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={backfilling || syncing !== null || !bfFrom || !bfTo}
                onClick={runBackfill}
              >
                <History className={`w-4 h-4 mr-2 ${backfilling ? 'animate-spin' : ''}`} />
                {backfilling ? '回补中...' : '回补区间'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={backfilling}
                onClick={() => { setBfFrom(localDateStr()); setBfTo(localDateStr()); }}
              >
                今天
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={backfilling}
                onClick={() => { setBfFrom(localDateStr(7)); setBfTo(localDateStr()); }}
              >
                近一周
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={backfilling}
                onClick={() => { setBfFrom(localDateStr(14)); setBfTo(localDateStr()); }}
              >
                近两周
              </Button>
              <span className="text-[12px] text-fg-3">按天/按周补缺失日线，单次最长 31 天</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
