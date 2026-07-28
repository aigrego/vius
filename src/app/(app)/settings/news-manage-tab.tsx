'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';

/* 设置页「资讯管理」tab（仅 admin 渲染；接口侧同样由 requireAdmin 兜底）。
   管理资讯快讯数据源（news_source 表，key 标识解析器），
   sync-news 定时任务每 15 秒轮询启用源抓取快讯并匹配个股落库。 */

interface NewsSourceItem {
  id: number;
  key: string;
  name: string;
  url: string | null;
  params: string | null;
  description: string | null;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncCount: number | null;
}

interface NewsStats {
  total: number;
  matched: number;
  todayCount: number;
  sourceTotal: number;
  sourceActive: number;
  latestAt: string | null;
}

interface SourceForm {
  name: string;
  key: string;
  url: string;
  params: string;
  description: string;
}

const EMPTY_FORM: SourceForm = { name: '', key: 'wallstcn', url: '', params: '', description: '' };

const KEY_LABELS: Record<string, string> = {
  wallstcn: '华尔街见闻',
  xuangubao: '选股宝'
};

export function NewsManageTab() {
  const [stats, setStats] = React.useState<NewsStats | null>(null);
  const [sources, setSources] = React.useState<NewsSourceItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // 新增/编辑弹窗
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NewsSourceItem | null>(null);
  const [form, setForm] = React.useState<SourceForm>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const fetchAll = React.useCallback(async () => {
    try {
      setError(null);
      const [statsRes, sourcesRes] = await Promise.all([
        fetch('/api/news/manage/stats'),
        fetch('/api/news/manage/sources')
      ]);
      const statsJson = await statsRes.json();
      const sourcesJson = await sourcesRes.json();
      if (statsJson.code !== 200) throw new Error(statsJson.message || '获取统计失败');
      if (sourcesJson.code !== 200) throw new Error(sourcesJson.message || '获取数据源失败');
      setStats(statsJson.data);
      setSources(sourcesJson.data);
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

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (s: NewsSourceItem) => {
    setEditing(s);
    setForm({
      name: s.name,
      key: s.key,
      url: s.url ?? '',
      params: s.params ?? '',
      description: s.description ?? ''
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        url: form.url,
        params: form.params,
        description: form.description
      };
      const res = editing
        ? await fetch(`/api/news/manage/sources/${editing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        : await fetch('/api/news/manage/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, key: form.key })
          });
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.message || '保存失败');
      setDialogOpen(false);
      flash(editing ? '数据源已更新' : '数据源已创建');
      await fetchAll();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (s: NewsSourceItem) => {
    const res = await fetch(`/api/news/manage/sources/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !s.enabled })
    });
    const json = await res.json();
    if (json.code !== 200) {
      alert(json.message || '操作失败');
      return;
    }
    flash(s.enabled ? `已停用「${s.name}」` : `已启用「${s.name}」`);
    await fetchAll();
  };

  const handleDelete = async (s: NewsSourceItem) => {
    if (!confirm(`确定删除数据源「${s.name}」？已落库的快讯不受影响。`)) return;
    const res = await fetch(`/api/news/manage/sources/${s.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.code !== 200) {
      alert(json.message || '删除失败');
      return;
    }
    flash(`已删除「${s.name}」`);
    await fetchAll();
  };

  if (error) {
    return <div className="py-10 text-center text-[13px] text-danger">{error}</div>;
  }
  if (!stats) {
    return <div className="py-10 text-center text-[13px] text-fg-3">加载中…</div>;
  }

  const statCards: { label: string; value: React.ReactNode }[] = [
    { label: '快讯总数', value: stats.total },
    { label: '已关联个股', value: stats.matched },
    { label: '今日新增', value: stats.todayCount },
    { label: '活跃数据源', value: stats.sourceActive },
    {
      label: '最新快讯',
      value: stats.latestAt ? new Date(stats.latestAt).toLocaleString('zh-CN', { hour12: false }) : '-'
    }
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 标题 + 新增按钮 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="m-0 text-[16px] font-semibold text-fg-1">资讯数据源</h2>
          <p className="mt-1 text-[12.5px] text-fg-3">
            管理快讯数据来源，定时任务每 15 秒轮询启用源并自动关联个股
          </p>
        </div>
        <Button size="md" onClick={openAdd}>
          <Plus size={14} />
          新增数据源
        </Button>
      </div>

      {notice && <div className="text-[12.5px] text-success">{notice}</div>}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statCards.map(c => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="text-[12px] text-fg-3">{c.label}</div>
              <div className="mt-1.5 text-[20px] font-semibold text-fg-1">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 数据源列表 */}
      <div>
        <h3 className="mb-2 text-[14px] font-semibold text-fg-1">数据源列表</h3>
        <div className="flex flex-col gap-3">
          {sources.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-[13px] text-fg-3">
                暂无数据源（下次快讯同步时会自动创建「华尔街见闻」「选股宝」）
              </CardContent>
            </Card>
          )}
          {sources.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-fg-1">{s.name}</span>
                    <Badge tone="blue">{KEY_LABELS[s.key] ?? s.key}</Badge>
                    <Badge tone={s.enabled ? 'success' : 'neutral'}>{s.enabled ? '启用' : '停用'}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => handleToggle(s)}>
                      {s.enabled ? '停用' : '启用'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(s)}>编辑</Button>
                    <Button variant="secondary" size="sm" className="text-danger" onClick={() => handleDelete(s)}>
                      删除
                    </Button>
                  </div>
                </div>
                {s.description && <div className="mt-1.5 text-[12.5px] text-fg-3">{s.description}</div>}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-3">
                  {s.url && <span className="font-mono">URL: {s.url}</span>}
                  {s.params && <span className="font-mono">参数: {s.params}</span>}
                  {s.lastSyncAt && (
                    <span>
                      上次同步: {new Date(s.lastSyncAt).toLocaleString('zh-CN', { hour12: false })}
                    </span>
                  )}
                  {s.lastSyncStatus && (
                    <Badge tone={s.lastSyncStatus === 'success' ? 'success' : 'danger'}>
                      {s.lastSyncStatus}
                    </Badge>
                  )}
                  {s.lastSyncStatus === 'success' && s.lastSyncCount != null && (
                    <span>（新增{s.lastSyncCount}条）</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 新增/编辑数据源弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[520px] bg-surface border-border p-6">
          <div className="text-[15px] font-semibold text-fg-1">{editing ? '编辑数据源' : '新增数据源'}</div>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">数据源名称 <span className="text-danger">*</span></label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="如: 华尔街见闻"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">解析器 <span className="text-danger">*</span></label>
              {editing ? (
                <Input value={KEY_LABELS[editing.key] ?? editing.key} disabled />
              ) : (
                <Select value={form.key} onValueChange={v => setForm({ ...form, key: v })}>
                  <SelectTrigger />
                  <SelectContent>
                    <SelectItem value="wallstcn">华尔街见闻</SelectItem>
                    <SelectItem value="xuangubao">选股宝</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">API地址</label>
              <Input
                value={form.url}
                onChange={e => setForm({ ...form, url: e.target.value })}
                placeholder="留空使用内置默认地址"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">参数</label>
              <Input
                value={form.params}
                onChange={e => setForm({ ...form, params: e.target.value })}
                placeholder="可选，如选股宝 subj_ids：9,10,723,35,469,821"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">描述</label>
              <Textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
              {saving ? '保存中…' : '确认'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
