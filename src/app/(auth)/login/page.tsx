'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ERROR_MESSAGES: Record<string, string> = {
  feishu: '飞书登录失败，请重试',
  lark: 'Lark 登录失败，请重试',
};

function LoginForm() {
  const searchParams = useSearchParams();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [oauth, setOauth] = React.useState<{ feishu: boolean; lark: boolean } | null>(null);

  // OAuth 回调失败会跳到 /login?error=<provider>，在此透出提示。
  React.useEffect(() => {
    const p = searchParams.get('error');
    if (p) setError(ERROR_MESSAGES[p] ?? '第三方登录失败，请重试');
  }, [searchParams]);

  // 第三方登录入口仅在服务端已配置时展示；未配置 / 接口失败都隐藏按钮。
  React.useEffect(() => {
    let alive = true;
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((res) => {
        if (alive && res?.code === 200 && res.data?.oauth) setOauth(res.data.oauth);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const res = await r.json();
      if (res?.code !== 200) {
        setError(res?.message || '登录失败，请重试');
        setBusy(false);
        return;
      }
      // cookie 已种下；整页跳转保证整棵 (app) 树带着新会话重新挂载。
      window.location.href = '/stock';
    } catch {
      setError('网络异常，请重试');
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[360px] rounded-xl border border-border bg-surface p-6 shadow-xl">
      <h1 className="m-0 text-center text-[22px] font-semibold tracking-tight text-fg-1 lg:text-left">
        欢迎回来
      </h1>
      <p className="mb-6 mt-1.5 text-center text-[12.5px] text-fg-3 lg:text-left">
        登录观微 vius，继续你的行情监控
      </p>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-fg-2">用户名</span>
          <Input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-fg-2">密码</span>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>
        {error && (
          <div className="rounded-lg bg-danger-50 px-3 py-2 text-[12.5px] text-danger">{error}</div>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={!username.trim() || !password || busy}>
          {busy ? '登录中…' : '登录'}
        </Button>
      </form>

      {oauth && (oauth.feishu || oauth.lark) && (
        <>
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-fg-3">或使用以下方式登录</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-col gap-2.5">
            {oauth.feishu && (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => {
                  window.location.href = '/api/auth/feishu/login';
                }}
              >
                飞书登录
              </Button>
            )}
            {oauth.lark && (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => {
                  window.location.href = '/api/auth/lark/login';
                }}
              >
                Lark 登录
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-bg">
      {/* 左侧品牌区（移动端隐藏） */}
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-brand-blue p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, rgba(14,165,233,0.22), transparent 55%), linear-gradient(20deg, rgba(2,6,23,0.55), transparent 60%)',
          }}
        />
        <div className="relative flex items-center gap-2.5 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-white/15 text-[15px] font-bold">
            微
          </span>
          <span className="text-[15px] font-semibold tracking-tight">观微 vius</span>
        </div>

        <div className="relative mt-10">
          <h2 className="m-0 text-[30px] font-semibold leading-snug tracking-tight text-white">
            A股行情同步
            <br />
            多维分析与持仓监控
          </h2>
          <p className="mt-3 max-w-[420px] text-[14px] leading-relaxed text-white/75">
            每日收盘自动同步全市场日线，底部/顶部放量信号、筹码分布与快讯舆情，一站式掌握持仓动态。
          </p>
        </div>

        <p className="relative m-0 text-[12px] text-white/50">观微知著，见微知势</p>
      </aside>

      {/* 右侧登录表单 */}
      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <React.Suspense fallback={null}>
          <LoginForm />
        </React.Suspense>
      </main>
    </div>
  );
}
