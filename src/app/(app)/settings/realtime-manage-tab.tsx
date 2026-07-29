'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/* 设置页「行情管理」tab（仅 admin 渲染；接口侧同样由 requireAdmin 兜底）。
   管理实时行情数据源（realtime_source 表，key 标识解析器），
   fetchRealtimeQuotes 按 sort 升序只循环启用源，前一个失败自动降级下一个；
   服务端有 10s 进程缓存，启停操作最长 10 秒后生效。 */

interface RealtimeSourceItem {
  id: number;
  key: string;
  name: string;
  sort: number;
  description: string | null;
  enabled: boolean;
}

const KEY_LABELS: Record<string, string> = {
  sina: '新浪财经',
  tencent: '腾讯财经',
  eastmoney: '东方财富'
};

export function RealtimeManageTab() {
  const [sources, setSources] = React.useState<RealtimeSourceItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

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

  if (error) {
    return <div className="py-10 text-center text-[13px] text-danger">{error}</div>;
  }
  if (!sources) {
    return <div className="py-10 text-center text-[13px] text-fg-3">加载中…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="m-0 text-[16px] font-semibold text-fg-1">行情数据源</h2>
        <p className="mt-1 text-[12.5px] text-fg-3">
          实时行情按顺序只请求启用源，前一个失败/超时自动降级下一个；生产环境可停用不可达的源避免空等
        </p>
      </div>

      {notice && <div className="text-[12.5px] text-success">{notice}</div>}

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
  );
}
