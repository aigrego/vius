// 定时任务调度：每日收盘同步、盘中告警检查、快讯抓取
// 通过 instrumentation.ts 的 register() 在 Node.js 运行时启动；
// 用 globalThis 挂标记防止开发热重载时重复注册

import cron from 'node-cron';
import { syncDailyStocks, getBeijingDateStr } from '@/lib/jobs/sync-daily';
import { runVolumeSignalJob } from '@/lib/analysis/volume-signals';
import { runAlertCheckAll } from '@/lib/jobs/check-alerts';
import { syncNews } from '@/lib/jobs/sync-news';

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

export function startScheduler(): void {
  const g = globalThis as unknown as { __oriolesSchedulerStarted?: boolean };
  if (g.__oriolesSchedulerStarted) return;
  g.__oriolesSchedulerStarted = true;

  // cron 表达式按服务器本地时间触发，显式指定北京时区（A股交易时段以北京时间为准）

  // 15:30 周一~周五：收盘同步 + 信号计算 + 告警检查
  cron.schedule('30 15 * * 1-5', () => {
    void runDailyCloseJobs();
  }, { timezone: 'Asia/Shanghai' });

  // 盘中每 5 分钟（9-15 点，函数内再卡 9:30-15:00）：告警检查
  cron.schedule('*/5 9-15 * * 1-5', () => {
    void runIntradayAlertCheck();
  }, { timezone: 'Asia/Shanghai' });

  // 每 30 分钟：快讯抓取（全天，不敏感于时区）
  cron.schedule('*/30 * * * *', () => {
    void runSyncNews();
  });

  console.log('[scheduler] 定时任务已注册（收盘同步 15:30 / 盘中告警 5min / 快讯 30min）');
}
