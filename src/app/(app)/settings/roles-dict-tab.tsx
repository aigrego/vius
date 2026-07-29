'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';

/* 设置页「角色字典」tab（仅 admin 渲染；接口侧由 requireAdmin 兜底）。
   维护角色（roles 表）：新增/重命名/删除；各模块权限在「权限矩阵」tab 配置。 */

interface RoleItem {
  id: string;
  key: string;
  name: string;
  builtin: boolean;
  userCount: number;
}

export function RolesDictTab() {
  const [roles, setRoles] = React.useState<RoleItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // 新增角色弹窗
  const [addOpen, setAddOpen] = React.useState(false);
  const [form, setForm] = React.useState({ key: '', name: '' });
  const [saving, setSaving] = React.useState(false);

  // 重命名弹窗
  const [renameTarget, setRenameTarget] = React.useState<RoleItem | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [renameSaving, setRenameSaving] = React.useState(false);

  const fetchAll = React.useCallback(async () => {
    try {
      const res = await fetch('/api/roles');
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.message || '获取角色列表失败');
      // setState 一律发生在 await 之后（避免 effect 首次同步调用级联渲染）
      setError(null);
      setRoles(json.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  React.useEffect(() => {
    // 首载放宏任务里：setState 发生在 fetch 回调中，避免 effect 同步阶段级联渲染
    const t = setTimeout(() => {
      void fetchAll();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchAll]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleAdd = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: form.key.trim(), name: form.name.trim() })
      });
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.message || '创建失败');
      setAddOpen(false);
      setForm({ key: '', name: '' });
      flash(`角色「${form.name.trim()}」已创建，可到「权限矩阵」配置其权限`);
      await fetchAll();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/roles/${renameTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() })
      });
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.message || '重命名失败');
      setRenameTarget(null);
      flash(`已重命名为「${renameValue.trim()}」`);
      await fetchAll();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setRenameSaving(false);
    }
  };

  const handleDelete = async (r: RoleItem) => {
    if (!confirm(`确定删除角色「${r.name}（${r.key}）」？其在权限矩阵中的配置将一并清除。`)) return;
    const res = await fetch(`/api/roles/${r.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.code !== 200) {
      alert(json.message || '删除失败');
      return;
    }
    flash(`已删除「${r.name}」`);
    await fetchAll();
  };

  if (error) {
    return <div className="py-10 text-center text-[13px] text-danger">{error}</div>;
  }
  if (!roles) {
    return <div className="py-10 text-center text-[13px] text-fg-3">加载中…</div>;
  }

  // 删除禁用原因（内置 / 仍有用户使用）
  const deleteBlockReason = (r: RoleItem): string | null => {
    if (r.builtin) return '内置角色不可删除';
    if (r.userCount > 0) return '仍有用户使用该角色';
    return null;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 说明 + 新增按钮 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="m-0 text-[16px] font-semibold text-fg-1">角色字典</h2>
          <p className="mt-1 text-[12.5px] text-fg-3">
            系统内置 管理员（admin）/ VIP用户（member）两个角色，内置角色不可删除、key 不可修改
          </p>
        </div>
        <Button size="md" onClick={() => { setForm({ key: '', name: '' }); setAddOpen(true); }}>
          <Plus size={14} />
          新增角色
        </Button>
      </div>

      {notice && <div className="text-[12.5px] text-success">{notice}</div>}

      <Card>
        <CardContent className="p-0">
          {roles.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-fg-3">暂无角色（请先运行 db:seed 初始化内置角色）</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>key</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>内置</TableHead>
                  <TableHead>用户数</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map(r => {
                  const blocked = deleteBlockReason(r);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.key}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        {r.builtin ? <Badge tone="blue">内置</Badge> : <Badge tone="neutral">自定义</Badge>}
                      </TableCell>
                      <TableCell>{r.userCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => { setRenameTarget(r); setRenameValue(r.name); }}
                          >
                            重命名
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="text-danger"
                            disabled={blocked !== null}
                            title={blocked ?? undefined}
                            onClick={() => handleDelete(r)}
                          >
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 新增角色弹窗 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="w-[420px] bg-surface border-border p-6">
          <div className="text-[15px] font-semibold text-fg-1">新增角色</div>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">key <span className="text-danger">*</span></label>
              <Input
                value={form.key}
                onChange={e => setForm({ ...form, key: e.target.value })}
                placeholder="小写字母开头，2-20 位小写字母/数字/下划线"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">名称 <span className="text-danger">*</span></label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="1-20 字，如：访客"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>取消</Button>
            <Button
              onClick={handleAdd}
              disabled={!/^[a-z][a-z0-9_]{1,19}$/.test(form.key.trim()) || !form.name.trim() || form.name.trim().length > 20 || saving}
            >
              {saving ? '保存中…' : '确认'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 重命名弹窗 */}
      <Dialog open={renameTarget !== null} onOpenChange={open => { if (!open) setRenameTarget(null); }}>
        <DialogContent className="w-[420px] bg-surface border-border p-6">
          <div className="text-[15px] font-semibold text-fg-1">重命名角色</div>
          <div className="space-y-4 py-4">
            <p className="m-0 text-[13px] text-fg-3">
              角色 key（{renameTarget?.key}）不可修改，仅改显示名称
            </p>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">名称 <span className="text-danger">*</span></label>
              <Input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                placeholder="1-20 字"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>取消</Button>
            <Button
              onClick={handleRename}
              disabled={!renameValue.trim() || renameValue.trim().length > 20 || renameSaving}
            >
              {renameSaving ? '保存中…' : '确认'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
