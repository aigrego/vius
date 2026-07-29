'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/* 设置页「权限矩阵」tab（仅 admin 渲染；接口侧由 requireAdmin 兜底）。
   行 = 治理路由，列 = 非 admin 角色；单元格三档：读写 rw / 只读 ro / 不可见 hidden。
   改动先落本地 state，点「保存」整体 PUT /api/permissions。 */

type Level = 'rw' | 'ro' | 'hidden';

interface RouteDef {
  route: string;
  label: string;
}

interface RoleDef {
  key: string;
  name: string;
}

interface MatrixData {
  routes: RouteDef[];
  roles: RoleDef[];
  matrix: Record<string, Record<string, Level>>;
}

// 三档权限的文案与颜色（普通 Tailwind 色；不用 text-up/text-down，那是行情涨跌语义类）
const LEVEL_OPTIONS: { value: Level; label: string; className: string }[] = [
  { value: 'rw', label: '读写', className: 'text-green-600' },
  { value: 'ro', label: '只读', className: 'text-blue-600' },
  { value: 'hidden', label: '不可见', className: 'text-fg-3' }
];

export function PermMatrixTab() {
  const [data, setData] = React.useState<MatrixData | null>(null);
  // 本地编辑副本：roleKey -> route -> level
  const [draft, setDraft] = React.useState<Record<string, Record<string, Level>>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const fetchAll = React.useCallback(async () => {
    try {
      const res = await fetch('/api/permissions');
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.message || '获取权限矩阵失败');
      // setState 一律发生在 await 之后（避免 effect 首次同步调用级联渲染）
      setError(null);
      setData(json.data);
      setDraft(json.data.matrix);
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

  const setLevel = (roleKey: string, route: string, level: Level) => {
    setDraft(prev => ({
      ...prev,
      [roleKey]: { ...prev[roleKey], [route]: level }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix: draft })
      });
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.message || '保存失败');
      flash('权限矩阵已保存，即时生效');
      await fetchAll();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return <div className="py-10 text-center text-[13px] text-danger">{error}</div>;
  }
  if (!data) {
    return <div className="py-10 text-center text-[13px] text-fg-3">加载中…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 说明条 + 保存按钮 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="m-0 text-[16px] font-semibold text-fg-1">权限矩阵</h2>
          <p className="mt-1 text-[12.5px] text-fg-3">
            管理员恒为全部权限；不可见 = 隐藏侧边栏入口并禁止访问对应模块接口；只读 = 可查看但不可写
          </p>
        </div>
        <Button size="md" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>

      {notice && <div className="text-[12.5px] text-success">{notice}</div>}

      <Card>
        <CardContent className="p-0">
          {data.roles.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-fg-3">
              暂无可配置角色（admin 恒为全部权限，请先在「角色字典」新增角色）
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>模块</TableHead>
                  {data.roles.map(r => (
                    <TableHead key={r.key}>{r.name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.routes.map(route => (
                  <TableRow key={route.route}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{route.label}</span>
                        <span className="font-mono text-[11.5px] text-fg-3">{route.route}</span>
                      </div>
                    </TableCell>
                    {data.roles.map(role => (
                      <TableCell key={role.key}>
                        <Select
                          value={draft[role.key]?.[route.route] ?? 'ro'}
                          onValueChange={v => setLevel(role.key, route.route, v as Level)}
                        >
                          <SelectTrigger className="h-8 w-[104px]" />
                          <SelectContent>
                            {LEVEL_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <span className={opt.className}>{opt.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
