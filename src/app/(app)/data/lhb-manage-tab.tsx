'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Plus, X } from 'lucide-react';

/* 数据中心「龙虎榜管理」tab（仅 admin 渲染；接口侧同样由 requireAdmin 兜底）。
   管理龙虎榜数据来源（东财 datacenter API），并可按日期清除已落库数据。 */

interface LhbSourceItem {
  id: number;
  name: string;
  type: string;
  url: string | null;
  apiKey: string | null;
  cron: string | null;
  description: string | null;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncCount: number | null;
}

interface LhbStats {
  tradeDays: number;
  stockCount: number;
  seatCount: number;
  sourceTotal: number;
  sourceActive: number;
  latestDate: string | null;
  dates: string[];
}

interface SourceForm {
  name: string;
  type: string;
  url: string;
  apiKey: string;
  cron: string;
  description: string;
}

const EMPTY_FORM: SourceForm = { name: '', type: 'api', url: '', apiKey: '', cron: '', description: '' };

export function LhbManageTab() {
  const [stats, setStats] = React.useState<LhbStats | null>(null);
  const [sources, setSources] = React.useState<LhbSourceItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // 新增/编辑弹窗
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LhbSourceItem | null>(null);
  const [form, setForm] = React.useState<SourceForm>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  // 历史区间回补
  const [bfFrom, setBfFrom] = React.useState('');
  const [bfTo, setBfTo] = React.useState('');
  const [backfilling, setBackfilling] = React.useState(false);

  const fetchAll = React.useCallback(async () => {
    try {
      setError(null);
      const [statsRes, sourcesRes] = await Promise.all([
        fetch('/api/lhb/manage/stats'),
        fetch('/api/lhb/manage/sources')
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

  // 本地日期 YYYY-MM-DD（n 天前）
  const localDateStr = (nDaysAgo = 0): string => {
    const d = new Date(Date.now() - nDaysAgo * 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // 历史区间回补：逐工作日同步（走 /api/ashare/sync?type=lhb，空榜日自动跳过）
  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      const res = await fetch(`/api/ashare/sync?type=lhb&from=${bfFrom}&to=${bfTo}`, { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.code !== 200) throw new Error(json?.message || '回补失败');
      const d = json.data?.lhb;
      flash(d ? `回补完成：${d.total} 个工作日，成功 ${d.synced} 天` : '回补完成');
      await fetchAll();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBackfilling(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (s: LhbSourceItem) => {
    setEditing(s);
    setForm({
      name: s.name,
      type: s.type || 'api',
      url: s.url ?? '',
      apiKey: s.apiKey ?? '',
      cron: s.cron ?? '',
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
        apiKey: form.apiKey,
        cron: form.cron,
        description: form.description
      };
      const res = editing
        ? await fetch(`/api/lhb/manage/sources/${editing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        : await fetch('/api/lhb/manage/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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

  const handleToggle = async (s: LhbSourceItem) => {
    const res = await fetch(`/api/lhb/manage/sources/${s.id}`, {
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

  const handleDeleteSource = async (s: LhbSourceItem) => {
    if (!confirm(`确定删除数据源「${s.name}」？已落库的龙虎榜数据不受影响。`)) return;
    const res = await fetch(`/api/lhb/manage/sources/${s.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.code !== 200) {
      alert(json.message || '删除失败');
      return;
    }
    flash(`已删除「${s.name}」`);
    await fetchAll();
  };

  const handleDeleteDate = async (date: string) => {
    if (!confirm(`确定删除 ${date} 的龙虎榜数据？将同时清除该日所有个股和席位数据，不可恢复。`)) return;
    const res = await fetch(`/api/lhb/manage/dates?date=${date}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.code !== 200) {
      alert(json.message || '删除失败');
      return;
    }
    flash(`已删除 ${date} 的数据`);
    await fetchAll();
  };

  if (error) {
    return <div className="py-10 text-center text-[13px] text-danger">{error}</div>;
  }
  if (!stats) {
    return <div className="py-10 text-center text-[13px] text-fg-3">加载中…</div>;
  }

  const statCards: { label: string; value: React.ReactNode }[] = [
    { label: '交易日数', value: stats.tradeDays },
    { label: '个股记录', value: stats.stockCount },
    { label: '席位明细', value: stats.seatCount },
    { label: '活跃数据源', value: stats.sourceActive },
    { label: '最新日期', value: stats.latestDate ?? '-' }
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 标题 + 新增按钮 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="m-0 text-[16px] font-semibold text-fg-1">数据源管理</h2>
          <p className="mt-1 text-[12.5px] text-fg-3">管理龙虎榜数据来源，配置API接口或手动导入</p>
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
                暂无数据源（首次同步龙虎榜时会自动创建「东方财富龙虎榜」）
              </CardContent>
            </Card>
          )}
          {sources.map(s => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-fg-1">{s.name}</span>
                    <Badge tone="blue">API接口</Badge>
                    <Badge tone={s.enabled ? 'success' : 'neutral'}>{s.enabled ? '启用' : '停用'}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => handleToggle(s)}>
                      {s.enabled ? '停用' : '启用'}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(s)}>编辑</Button>
                    <Button variant="secondary" size="sm" className="text-danger" onClick={() => handleDeleteSource(s)}>
                      删除
                    </Button>
                  </div>
                </div>
                {s.description && <div className="mt-1.5 text-[12.5px] text-fg-3">{s.description}</div>}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-3">
                  {s.url && <span className="font-mono">URL: {s.url}</span>}
                  {s.lastSyncAt && (
                    <span>
                      上次同步: {new Date(s.lastSyncAt).toISOString().replace('T', ' ').slice(0, 19)}Z
                    </span>
                  )}
                  {s.lastSyncStatus && (
                    <Badge tone={s.lastSyncStatus === 'success' ? 'success' : 'danger'}>
                      {s.lastSyncStatus}
                    </Badge>
                  )}
                  {s.lastSyncStatus === 'success' && s.lastSyncCount != null && (
                    <span>（{s.lastSyncCount}条）</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 历史区间回补（按天/按周补缺，单次最长 31 天，空榜日自动跳过） */}
      <div>
        <h3 className="mb-2 text-[14px] font-semibold text-fg-1">历史回补</h3>
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
                disabled={backfilling || !bfFrom || !bfTo}
                onClick={handleBackfill}
              >
                {backfilling ? '回补中…' : '回补区间'}
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
              <span className="text-[12px] text-fg-3">逐工作日同步，非交易日自动跳过，单次最长 31 天</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 已有数据日期 */}
      <div>
        <h3 className="mb-2 text-[14px] font-semibold text-fg-1">已有数据日期</h3>
        <Card>
          <CardContent className="p-4">
            {stats.dates.length === 0 ? (
              <div className="py-4 text-center text-[13px] text-fg-3">暂无数据</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stats.dates.map(d => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-[12.5px] text-fg-1"
                  >
                    {d}
                    <button
                      className="text-fg-3 transition-colors hover:text-danger"
                      title={`删除 ${d} 的数据`}
                      onClick={() => handleDeleteDate(d)}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-[12px] text-fg-3">提示: 删除日期将同时清除该日所有个股和席位数据，不可恢复</p>
          </CardContent>
        </Card>
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
                placeholder="如: 东方财富龙虎榜"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">来源类型 <span className="text-danger">*</span></label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger />
                <SelectContent>
                  <SelectItem value="api">API接口</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">API地址</label>
              <Input
                value={form.url}
                onChange={e => setForm({ ...form, url: e.target.value })}
                placeholder="https:// ..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">API密钥</label>
              <Input
                value={form.apiKey}
                onChange={e => setForm({ ...form, apiKey: e.target.value })}
                placeholder="可选备注"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">定时调度</label>
              <Input
                value={form.cron}
                onChange={e => setForm({ ...form, cron: e.target.value })}
                placeholder="cron表达式，如：30 16 * * 1-5"
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
