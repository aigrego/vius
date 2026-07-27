// Next.js instrumentation：Node.js 运行时启动时注册定时任务
// 注意：import 用相对路径，instrumentation 对 @ alias 支持不稳
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}
