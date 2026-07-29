'use client';

import * as React from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CirclePlay, ShieldX } from 'lucide-react';
import { cronToHuman } from '@/utils/cron-human';

/* 定时任务管理页（仅 admin）：cron 表达式 / 启用开关可改，支持手动触发。
   SWR 每 5s 轮询 /api/cron；非 admin（403）显示无权限空态。
   client 组件无法导出 metadata，标题沿用根布局「观微 vius」（同 settings 等同级 client 页）。 */

interface JobRunInfo {
  id: number;
  trigger: string;
  status: string; // running / success / failed
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface CronJobItem {
  id: string;
  name: string;
  description: string;
  cron: string;
  defaultCron: string;
  timezone: string | null;
  enabled: boolean;
  running: boolean;
  lastRun: JobRunInfo | null;
}

// 带 HTTP 状态码的错误，供 403 空态判断
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const fetcher = async (url: string): Promise<CronJobItem[]> => {
  const res = await fetch(url);
  const result = await res.json().catch(() => null);
  if (!res.ok || !result || result.code !== 200) {
    throw new HttpError(res.status, result?.message || '加载失败');
  }
  return result.data as CronJobItem[];
};

// 运行状态 → Badge 文案与配色
const STATUS_META: Record<string, { label: string; tone: 'blue' | 'success' | 'danger' | 'neutral' }> = {
  running: { label: '运行中', tone: 'blue' },
  success: { label: '成功', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

// 耗时（秒，不足 1s 显示 <1s）
function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return '-';
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return '<1s';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}

export default function CronJobsPage() {
  const { data: jobs, error, mutate } = useSWR<CronJobItem[]>('/api/cron', fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });

  // cron 输入框草稿（id → 编辑中的表达式）；保存成功/数据刷新后以服务端值为准
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  // 行内操作反馈（保存/触发结果）
  const [notices, setNotices] = React.useState<Record<string, string>>({});
  // 正在保存的行
  const [saving, setSaving] = React.useState<string | null>(null);
  // 已点击「立即执行」、等待轮询确认开始/结束的行
  const [triggering, setTriggering] = React.useState<string | null>(null);

  const forbidden = error instanceof HttpError && (error.status === 401 || error.status === 403);

  const setNotice = (id: string, text: string) => {
    setNotices((prev) => ({ ...prev, [id]: text }));
  };

  const save = async (job: CronJobItem) => {
    const cronExpr = (drafts[job.id] ?? job.cron).trim();
    try {
      setSaving(job.id);
      const res = await fetch(`/api/cron/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron: cronExpr }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok || !result || result.code !== 200) {
        throw new Error(result?.message || '保存失败');
      }
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
      setNotice(job.id, '已保存');
      await mutate();
    } catch (e) {
      setNotice(job.id, (e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const toggleEnabled = async (job: CronJobItem, enabled: boolean) => {
    // 乐观更新
    await mutate(
      (prev) => prev?.map((j) => (j.id === job.id ? { ...j, enabled } : j)),
      { revalidate: false },
    );
    try {
      const res = await fetch(`/api/cron/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok || !result || result.code !== 200) {
        throw new Error(result?.message || '保存失败');
      }
      setNotice(job.id, enabled ? '已启用' : '已停用');
    } catch (e) {
      setNotice(job.id, (e as Error).message);
    } finally {
      await mutate();
    }
  };

  const trigger = async (job: CronJobItem) => {
    try {
      setTriggering(job.id);
      const res = await fetch(`/api/cron/${job.id}/trigger`, { method: 'POST' });
      const result = await res.json().catch(() => null);
      if (!res.ok || !result || result.code !== 200) {
        throw new Error(result?.message || '触发失败');
      }
      setNotice(job.id, `已触发（运行 #${result.data?.runId}）`);
      await mutate();
    } catch (e) {
      setNotice(job.id, (e as Error).message);
    } finally {
      setTriggering(null);
    }
  };

  // 非 admin / 未登录：无权限空态
  if (forbidden) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-6 py-8">
        <h1 className="m-0 text-[22px] font-semibold tracking-tight text-fg-1">定时任务</h1>
        <div className="mt-16 flex flex-col items-center gap-2 text-fg-3">
          <ShieldX size={32} />
          <p className="text-[13.5px]">无权限查看（仅管理员可访问）</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] px-6 py-8">
      <h1 className="m-0 text-[22px] font-semibold tracking-tight text-fg-1">定时任务</h1>
      <p className="mb-5 mt-1 text-[13px] text-fg-3">
        调整执行频率或启停后立即生效；每 5 秒自动刷新运行状态
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务</TableHead>
                <TableHead className="w-[190px]">执行频率</TableHead>
                <TableHead>时区</TableHead>
                <TableHead>启用</TableHead>
                <TableHead>上次运行</TableHead>
                <TableHead className="w-[170px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!jobs && !error && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-fg-3">
                    加载中…
                  </TableCell>
                </TableRow>
              )}
              {error && !forbidden && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-danger">
                    {(error as Error).message}
                  </TableCell>
                </TableRow>
              )}
              {jobs?.map((job) => {
                const draft = drafts[job.id] ?? job.cron;
                const dirty = draft.trim() !== job.cron;
                const meta = job.lastRun ? STATUS_META[job.lastRun.status] : undefined;
                const busy = triggering === job.id || job.running;
                return (
                  <TableRow key={job.id}>
                    {/* 任务名 + 说明 */}
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-medium text-fg-1">
                          {job.name}
                          {job.running && (
                            <Badge tone="blue" dot className="ml-2">运行中</Badge>
                          )}
                        </span>
                        <span className="text-[12px] text-fg-3">{job.description}</span>
                      </div>
                    </TableCell>
                    {/* 执行频率：人类可读文本为主；下方输入框仍可编辑 cron 表达式，草稿实时预览含义 */}
                    <TableCell>
                      <span className="text-[13px] text-fg-1">{cronToHuman(job.cron)}</span>
                      <Input
                        value={draft}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [job.id]: e.target.value }))
                        }
                        className="mt-1 h-7 font-mono text-[12.5px]"
                        style={dirty ? { borderColor: 'var(--brand-orange)' } : undefined}
                      />
                      {dirty && (
                        <span className="mt-0.5 block text-[11px] text-fg-3">
                          未保存 · 新频率：{cronToHuman(draft.trim())}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[12.5px] text-fg-2">
                      {job.timezone ?? '服务器本地'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={job.enabled}
                        onCheckedChange={(v) => toggleEnabled(job, v)}
                      />
                    </TableCell>
                    {/* 上次运行：状态 + 开始时间 + 耗时 + 失败原因 */}
                    <TableCell>
                      {job.lastRun && meta ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            <span className="text-[11.5px] text-fg-3">
                              {job.lastRun.trigger === 'manual' ? '手动' : '自动'}
                            </span>
                          </div>
                          <span className="text-[12px] text-fg-2">
                            {formatTime(job.lastRun.startedAt)}
                            <span className="ml-1.5 text-fg-3">
                              耗时 {formatDuration(job.lastRun.startedAt, job.lastRun.finishedAt)}
                            </span>
                          </span>
                          {job.lastRun.status === 'failed' && job.lastRun.message && (
                            <span
                              className="max-w-[240px] truncate text-[11.5px] text-danger"
                              title={job.lastRun.message}
                            >
                              {job.lastRun.message}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12.5px] text-fg-3">从未运行</span>
                      )}
                    </TableCell>
                    {/* 操作：保存（有改动时高亮）/ 立即执行 */}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant={dirty ? 'primary' : 'secondary'}
                            disabled={!dirty || saving === job.id}
                            onClick={() => save(job)}
                          >
                            {saving === job.id ? '保存中…' : '保存'}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => trigger(job)}
                          >
                            <CirclePlay size={13} />
                            {busy ? '执行中…' : '立即执行'}
                          </Button>
                        </div>
                        {notices[job.id] && (
                          <span className="text-[11.5px] text-fg-3">{notices[job.id]}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
