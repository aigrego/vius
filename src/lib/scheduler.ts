// 定时任务调度（注册表模式）：每日收盘同步、盘中告警检查、快讯抓取
// - JOBS 注册全部任务（id/名称/说明/默认 cron/时区/handler）
// - startScheduler() 由 instrumentation.ts 的 register() 在 Node.js 运行时启动，
//   读 cron_job 覆盖表合并默认配置后逐个注册；用 globalThis 挂标记防止开发热重载重复注册
// - rescheduleJob()/triggerJob()/listJobs() 供 /api/cron 管理端点调用（仅 admin）
// - 每次执行落一条 cron_run 运行记录（running → success/failed + 耗时）；
//   运行记录写库失败只打日志，绝不影响任务本身

import cron, { type ScheduledTask } from 'node-cron';
import prisma from '@/lib/prisma';
import { syncDailyStocks, getBeijingDateStr } from '@/lib/jobs/sync-daily';
import { runVolumeSignalJob } from '@/lib/analysis/volume-signals';
import { runAlertCheckAll } from '@/lib/jobs/check-alerts';
import { syncNews } from '@/lib/jobs/sync-news';
import { syncLhb } from '@/lib/jobs/sync-lhb';
import { syncPlates, syncPlateStocks } from '@/lib/jobs/sync-plates';
import { syncSnapshot } from '@/lib/jobs/sync-snapshot';
import { syncFundamentals } from '@/lib/jobs/sync-fundamentals';

/* ---------- 任务定义 ---------- */

export interface JobDef {
  id: string;
  name: string;
  description: string;
  cron: string; // 默认 cron 表达式（可被 cron_job 表覆盖）
  timezone?: string; // 默认时区（不可覆盖）
  handler: () => Promise<void>;
}

// API 层用来映射状态码的错误类型
export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`任务不存在: ${id}`);
    this.name = 'JobNotFoundError';
  }
}

export class InvalidCronError extends Error {
  constructor(expression: string) {
    super(`cron 表达式非法: ${expression}`);
    this.name = 'InvalidCronError';
  }
}

export class JobRunningError extends Error {
  constructor(id: string) {
    super(`任务正在运行中: ${id}`);
    this.name = 'JobRunningError';
  }
}

// 当前北京时间（服务器时区可能不是东八区，统一换算）
const getBeijingNow = (): Date =>
  new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));

// 是否交易日：周一~周五
// 注意：节假日未处理。非交易日快照接口会返回上一交易日的数据，
// 落到当天 date 上有唯一约束兜底（重复跑只是覆盖），无害
export const isTradingDay = (date: Date): boolean => {
  const day = date.getDay();
  return day >= 1 && day <= 5;
};

// 收盘后任务链：日线同步 → 放量信号 → 告警检查，顺序执行、各自捕获异常
async function runDailyCloseJobs(): Promise<void> {
  const today = getBeijingDateStr(getBeijingNow());
  try {
    console.log('[scheduler] syncDailyStocks started');
    const result = await syncDailyStocks();
    console.log(`[scheduler] syncDailyStocks finished: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error('[scheduler] syncDailyStocks failed:', error);
  }
  try {
    console.log('[scheduler] runVolumeSignalJob started');
    const result = await runVolumeSignalJob(today);
    console.log(`[scheduler] runVolumeSignalJob finished: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error('[scheduler] runVolumeSignalJob failed:', error);
  }
  try {
    console.log('[scheduler] runAlertCheck started');
    const result = await runAlertCheckAll();
    console.log(`[scheduler] runAlertCheck finished: triggered=${result.triggered} saved=${result.saved}`);
  } catch (error) {
    console.error('[scheduler] runAlertCheck failed:', error);
  }
}

// 盘中告警检查：仅 9:30–15:00（北京时间）之间执行
async function runIntradayAlertCheck(): Promise<void> {
  const now = getBeijingNow();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 9 * 60 + 30 || minutes > 15 * 60) return;
  try {
    console.log('[scheduler] intraday runAlertCheck started');
    const result = await runAlertCheckAll();
    console.log(`[scheduler] intraday runAlertCheck finished: triggered=${result.triggered} saved=${result.saved}`);
  } catch (error) {
    console.error('[scheduler] intraday runAlertCheck failed:', error);
  }
}

async function runSyncNews(): Promise<void> {
  try {
    console.log('[scheduler] syncNews started');
    const result = await syncNews();
    console.log(`[scheduler] syncNews finished: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error('[scheduler] syncNews failed:', error);
  }
}

async function runSyncLhb(): Promise<void> {
  try {
    console.log('[scheduler] syncLhb started');
    const result = await syncLhb();
    console.log(`[scheduler] syncLhb finished: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error('[scheduler] syncLhb failed:', error);
  }
}

async function runSyncPlates(): Promise<void> {
  try {
    const result = await syncPlates();
    if (result.refreshed.length > 0 || result.failed.length > 0) {
      console.log(`[scheduler] syncPlates finished: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    console.error('[scheduler] syncPlates failed:', error);
  }
}

async function runSyncSnapshot(): Promise<void> {
  try {
    const result = await syncSnapshot();
    if (result.watched > 0) {
      console.log(`[scheduler] syncSnapshot finished: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    console.error('[scheduler] syncSnapshot failed:', error);
  }
}

async function runSyncFundamentals(): Promise<void> {
  try {
    console.log('[scheduler] syncFundamentals started');
    const result = await syncFundamentals();
    console.log(`[scheduler] syncFundamentals finished: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error('[scheduler] syncFundamentals failed:', error);
  }
}

async function runSyncPlateStocks(): Promise<void> {
  try {
    console.log('[scheduler] syncPlateStocks started');
    const result = await syncPlateStocks();
    console.log(`[scheduler] syncPlateStocks finished: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error('[scheduler] syncPlateStocks failed:', error);
  }
}

// 任务注册表：id 即 cron_job / cron_run 表里的外键
export const JOBS: JobDef[] = [
  {
    id: 'daily-close',
    name: '收盘同步与信号',
    description: '全市场日线同步 → 放量信号 → 告警检查（16:00 周一~周五）',
    cron: '0 16 * * 1-5',
    timezone: 'Asia/Shanghai',
    handler: runDailyCloseJobs,
  },
  {
    id: 'intraday-alerts',
    name: '盘中告警检查',
    description: '盘中每 5 分钟检查自选股告警（函数内卡 9:30-15:00）',
    cron: '*/5 9-15 * * 1-5',
    timezone: 'Asia/Shanghai',
    handler: runIntradayAlertCheck,
  },
  {
    id: 'sync-news',
    name: '快讯同步',
    description: '每 15 秒轮询启用的资讯源抓取快讯，提取关键词匹配个股落库',
    cron: '*/15 * * * * *',
    handler: runSyncNews,
  },
  {
    id: 'sync-lhb',
    name: '龙虎榜同步',
    description: '东财龙虎榜个股榜单+席位明细（17:30 周一~周五）',
    cron: '30 17 * * 1-5',
    timezone: 'Asia/Shanghai',
    handler: runSyncLhb,
  },
  {
    id: 'sync-plates',
    name: '板块行情缓存',
    description: '行业/题材/板块涨跌幅榜写 plate_cache（每分钟，函数内卡 9:30-15:00）',
    cron: '* 9-15 * * 1-5',
    timezone: 'Asia/Shanghai',
    handler: runSyncPlates,
  },
  {
    id: 'sync-snapshot',
    name: '盘中快照同步',
    description: '关注股（股票池∪持仓∪指数）每 10 秒写 stock_trade 当日行（函数内卡 9:30-15:00）；全市场日线由 daily-close 16:00 同步',
    cron: '*/10 * 9-15 * * 1-5',
    timezone: 'Asia/Shanghai',
    handler: runSyncSnapshot,
  },
  {
    id: 'sync-fundamentals',
    name: '基本面回填',
    description: '东财 F10 市值/主营/财务指标慢速回填 stock_dict（20:00 周一~周五）',
    cron: '0 20 * * 1-5',
    timezone: 'Asia/Shanghai',
    handler: runSyncFundamentals,
  },
  {
    id: 'sync-plate-stocks',
    name: '板块成分同步',
    description: '板块清单落 plate 表 + 成分股落 plate_stock（9:20 周一~周五盘前）',
    cron: '20 9 * * 1-5',
    timezone: 'Asia/Shanghai',
    handler: runSyncPlateStocks,
  },
];

/* ---------- 模块级运行状态 ---------- */

// 已注册的调度句柄（jobId → ScheduledTask），reschedule 时先销毁旧任务
const scheduledTasks = new Map<string, ScheduledTask>();

// 手动触发的运行互斥（单进程）：先查 cron_run 再插行存在竞态，
// 两个并发请求可能都查到「无运行中」，用内存 Set 兜底
const runningJobs = new Set<string>();

/* ---------- 运行记录 ---------- */

// 单任务最长执行时间：超时标记 failed 并结束本次运行记录（handler 无法真正取消，
// 迟到完成也不会再覆盖状态，见 finish 的 status='running' 守卫），
// 防止挂死的任务让列表永远「运行中」、手动触发永远 409
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

// 执行 handler 并落运行记录；runId 已传时复用该行（手动触发已先建好 running 行），
// 否则这里先建（自动调度）。任何一步写库失败只 console.error，不影响任务本身
async function executeJob(job: JobDef, trigger: 'auto' | 'manual', runId?: number): Promise<void> {
  let id = runId ?? null;
  if (id === null) {
    try {
      const run = await prisma.cronRun.create({
        data: { jobId: job.id, trigger, status: 'running' },
      });
      id = run.id;
    } catch (error) {
      console.error(`[scheduler] 运行记录创建失败（${job.id}），任务照常执行:`, error);
    }
  }

  const finish = async (status: 'success' | 'failed', message?: string): Promise<void> => {
    if (id === null) return;
    try {
      // updateMany + status='running' 守卫：超时已标 failed 后，迟到的 handler 完成不再覆盖
      await prisma.cronRun.updateMany({
        where: { id, status: 'running' },
        data: { status, message: message ?? null, finishedAt: new Date() },
      });
    } catch (error) {
      console.error(`[scheduler] 运行记录更新失败（${job.id}#${id}）:`, error);
    }
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const outcome = await Promise.race([
      job.handler().then(() => 'done' as const),
      new Promise<'timeout'>(resolve => {
        timer = setTimeout(() => resolve('timeout'), JOB_TIMEOUT_MS);
      }),
    ]);
    if (outcome === 'timeout') {
      console.error(`[scheduler] 任务执行超时（${job.id}，>${JOB_TIMEOUT_MS / 60000} 分钟）`);
      await finish('failed', `执行超时（>${JOB_TIMEOUT_MS / 60000} 分钟），已强制结束`);
    } else {
      await finish('success');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[scheduler] 任务执行失败（${job.id}）:`, error);
    await finish('failed', message.slice(0, 1000));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ---------- 调度控制 ---------- */

// 按生效配置注册一个任务；enabled=false 时不排（配置仍会落库/返回）
function scheduleJob(job: JobDef, cronExpr: string, enabled: boolean): void {
  if (!enabled) {
    console.log(`[scheduler] ${job.id} 已停用，跳过注册`);
    return;
  }
  const task = cron.schedule(
    cronExpr,
    () => {
      void executeJob(job, 'auto');
    },
    job.timezone ? { timezone: job.timezone } : undefined,
  );
  scheduledTasks.set(job.id, task);
}

// 读取覆盖配置（cron_job 表只存被修改过的任务行）；查询失败返回空 Map，调用方按默认配置兜底
async function loadOverrides(): Promise<Map<string, { cron: string; enabled: boolean }>> {
  try {
    const rows = await prisma.cronJob.findMany();
    return new Map(rows.map((r) => [r.id, { cron: r.cron, enabled: r.enabled }]));
  } catch (error) {
    console.error('[scheduler] 读取 cron_job 覆盖配置失败，按默认配置处理:', error);
    return new Map();
  }
}

// 进程重启时遗留的 running 记录一律标记失败：重启意味着 handler 已中断，
// 不清理的话僵尸 running 会让列表永远显示「运行中」、手动触发永远 409
async function cleanupStaleRuns(): Promise<void> {
  try {
    const stale = await prisma.cronRun.updateMany({
      where: { status: 'running' },
      data: { status: 'failed', message: '进程重启，运行中断', finishedAt: new Date() },
    });
    if (stale.count > 0) {
      console.log(`[scheduler] 已清理 ${stale.count} 条中断的运行记录`);
    }
  } catch (error) {
    console.error('[scheduler] 清理中断运行记录失败:', error);
  }
}

// 启动调度：合并覆盖配置后逐个注册。永不抛出（instrumentation 调用方不 await）
export async function startScheduler(): Promise<void> {
  const g = globalThis as unknown as { __oriolesSchedulerStarted?: boolean };
  if (g.__oriolesSchedulerStarted) return;
  g.__oriolesSchedulerStarted = true;

  try {
    await cleanupStaleRuns();
    const overrides = await loadOverrides();
    for (const job of JOBS) {
      const o = overrides.get(job.id);
      scheduleJob(job, o?.cron ?? job.cron, o?.enabled ?? true);
    }
    console.log(`[scheduler] 定时任务已注册：${JOBS.map((j) => j.id).join(', ')}`);
  } catch (error) {
    console.error('[scheduler] 定时任务注册失败:', error);
  }
}

// 修改任务配置：校验表达式 → 销毁旧任务 → 按新配置重新调度（enabled=false 则不排）→ upsert 覆盖行
export async function rescheduleJob(id: string, cronExpr: string, enabled: boolean): Promise<void> {
  const job = JOBS.find((j) => j.id === id);
  if (!job) throw new JobNotFoundError(id);
  if (!cron.validate(cronExpr)) throw new InvalidCronError(cronExpr);

  const old = scheduledTasks.get(id);
  if (old) {
    await old.stop();
    await old.destroy();
    scheduledTasks.delete(id);
  }
  scheduleJob(job, cronExpr, enabled);
  await prisma.cronJob.upsert({
    where: { id },
    create: { id, cron: cronExpr, enabled },
    update: { cron: cronExpr, enabled },
  });
  console.log(`[scheduler] ${id} 已重新调度：cron="${cronExpr}" enabled=${enabled}`);
}

// 手动触发：已在运行中（内存互斥或 cron_run 存在 running 行）则拒绝；
// 先建 running 行拿到 runId，再异步执行 handler（不 await）
export async function triggerJob(id: string): Promise<number> {
  const job = JOBS.find((j) => j.id === id);
  if (!job) throw new JobNotFoundError(id);
  if (runningJobs.has(id)) throw new JobRunningError(id);
  const running = await prisma.cronRun.findFirst({
    where: { jobId: id, status: 'running' },
    select: { id: true },
  });
  if (running) throw new JobRunningError(id);

  runningJobs.add(id);
  try {
    const run = await prisma.cronRun.create({
      data: { jobId: id, trigger: 'manual', status: 'running' },
    });
    void (async () => {
      try {
        await executeJob(job, 'manual', run.id);
      } finally {
        runningJobs.delete(id);
      }
    })();
    return run.id;
  } catch (error) {
    runningJobs.delete(id);
    throw error;
  }
}

/* ---------- 状态查询 ---------- */

export interface JobRunInfo {
  id: number;
  trigger: string;
  status: string;
  message: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface JobStatus {
  id: string;
  name: string;
  description: string;
  cron: string; // 生效的 cron（覆盖优先）
  defaultCron: string;
  timezone: string | null;
  enabled: boolean;
  running: boolean;
  lastRun: JobRunInfo | null;
}

// 注册表 + 生效配置 + 每 job 最近一条 cronRun + 是否运行中
export async function listJobs(): Promise<JobStatus[]> {
  const overrides = await loadOverrides();
  return Promise.all(
    JOBS.map(async (job) => {
      const o = overrides.get(job.id);
      let lastRun: JobRunInfo | null = null;
      let running = runningJobs.has(job.id);
      try {
        const row = await prisma.cronRun.findFirst({
          where: { jobId: job.id },
          orderBy: { startedAt: 'desc' },
        });
        if (row) {
          lastRun = {
            id: row.id,
            trigger: row.trigger,
            status: row.status,
            message: row.message,
            startedAt: row.startedAt.toISOString(),
            finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
          };
          running = running || row.status === 'running';
        }
      } catch (error) {
        console.error(`[scheduler] 查询运行记录失败（${job.id}）:`, error);
      }
      return {
        id: job.id,
        name: job.name,
        description: job.description,
        cron: o?.cron ?? job.cron,
        defaultCron: job.cron,
        timezone: job.timezone ?? null,
        enabled: o?.enabled ?? true,
        running,
        lastRun,
      };
    }),
  );
}
