'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Github, KeyRound, Mail, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SegBtn } from '@/components/ui/segmented';

/* 个人资料页：资料（姓名 + 多邮箱管理）/ 安全（改密、TOTP 占位、OAuth 绑定、当前会话）两个 Tab。
   数据来自 GET /api/auth/profile；邮箱/绑定操作即时生效后整体 refetch。 */

interface ProfileUser {
  username: string;
  name: string | null;
  role: string;
  avatarUrl: string | null;
  hasPassword: boolean;
  oauthBound: boolean; // 飞书 / Lark
  githubBound: boolean; // GitHub
}

interface EmailItem {
  email: string;
  isPrimary: boolean;
  source: string; // manual / feishu / lark
}

interface ProfileData {
  user: ProfileUser;
  emails: EmailItem[];
}

async function fetchProfile(): Promise<ProfileData | null> {
  try {
    const r = await fetch('/api/auth/profile');
    const res = await r.json();
    return res?.code === 200 ? (res.data as ProfileData) : null;
  } catch {
    return null;
  }
}

/* 头像：有 avatarUrl 用图片，否则首字色块（与 Header 同款）。 */
function Avatar({ user, size }: { user: ProfileUser | null; size: number }) {
  const name = user?.name || user?.username || '用户';
  if (user?.avatarUrl) {
    return (
      // 第三方头像外链，不走 next/image 域名白名单
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt={name}
        className="flex-none rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="grid flex-none place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: 'var(--brand-blue)', fontSize: size * 0.4 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-fg-2">{label}</span>
      {children}
    </label>
  );
}

/* 邮箱来源 badge：OAuth 带回的邮箱标「Lark 验证」/「飞书验证」。 */
function SourceBadge({ source }: { source: string }) {
  if (source === 'lark') return <Badge> Lark 验证 </Badge>;
  if (source === 'feishu') return <Badge>飞书验证</Badge>;
  return null;
}

function ProfileTab({ data, reload }: { data: ProfileData; reload: () => void }) {
  const [name, setName] = React.useState(data.user.name ?? '');
  const [newEmail, setNewEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [tip, setTip] = React.useState<{ ok: boolean; text: string } | null>(null);

  const call = async (input: string, init: RequestInit, fallback: string) => {
    setBusy(true);
    setTip(null);
    try {
      const r = await fetch(input, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
      const res = await r.json();
      setTip({ ok: res?.code === 200, text: res?.message || fallback });
      if (res?.code === 200) reload();
    } catch {
      setTip({ ok: false, text: '网络异常，请重试' });
    } finally {
      setBusy(false);
    }
  };

  const saveName = () =>
    call('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ name }) }, '保存失败');
  const addEmail = () => {
    if (!newEmail.trim() || busy) return;
    call('/api/auth/profile/emails', { method: 'POST', body: JSON.stringify({ email: newEmail }) }, '添加失败').then(
      () => setNewEmail(''),
    );
  };
  const setPrimary = (email: string) =>
    call('/api/auth/profile/emails/primary', { method: 'POST', body: JSON.stringify({ email }) }, '设置失败');
  const removeEmail = (email: string) =>
    call('/api/auth/profile/emails', { method: 'DELETE', body: JSON.stringify({ email }) }, '删除失败');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[16px]">基本资料</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* 头像 + 当前身份 */}
        <div className="flex items-center gap-3">
          <Avatar user={data.user} size={56} />
          <div className="min-w-0">
            <div className="truncate text-[16px] font-semibold text-fg-1">
              {data.user.name || data.user.username}
            </div>
            <div className="truncate text-[13px] text-fg-3">@{data.user.username}</div>
          </div>
        </div>

        <Field label="姓名">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="你的姓名" />
        </Field>
        <Field label="昵称">
          <Input disabled placeholder="即将上线" />
        </Field>
        <Field label="手机号">
          <Input disabled placeholder="选填 · 即将上线" />
        </Field>

        {/* 邮箱管理 */}
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-medium text-fg-2">邮箱</span>
          {data.emails.map((e) => (
            <div
              key={e.email}
              className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5"
            >
              <Mail size={15} className="flex-none text-fg-3" />
              <span className="truncate text-[13.5px] text-fg-1">{e.email}</span>
              {e.isPrimary && <Badge tone="blue">主邮箱</Badge>}
              <SourceBadge source={e.source} />
              <span className="flex-1" />
              {!e.isPrimary && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPrimary(e.email)}
                    className="flex-none text-[12.5px] font-medium text-brand-blue hover:underline disabled:opacity-40"
                  >
                    设为主邮箱
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeEmail(e.email)}
                    title="删除该邮箱"
                    className="flex-none text-fg-3 transition-colors hover:text-danger disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="name@example.com"
              className="flex-1"
            />
            <Button variant="secondary" onClick={addEmail} disabled={!newEmail.trim() || busy}>
              + 添加备用邮箱
            </Button>
          </div>
          <p className="m-0 text-[12px] text-fg-3">
            任一邮箱均可作为登录账号；带「Lark 验证」的邮箱来自第三方登录
          </p>
        </div>

        {tip && (
          <div
            className="rounded-lg px-3 py-2 text-[12.5px]"
            style={{
              background: tip.ok ? 'var(--success-50)' : 'var(--danger-50)',
              color: tip.ok ? 'var(--success-500)' : 'var(--danger)',
            }}
          >
            {tip.text}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="primary" onClick={saveName} disabled={busy}>
            保存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* 简单 UA 解析：「macOS · Chrome」形式，仅用于展示当前会话。 */
function parseUA(ua: string): string {
  const os = ua.includes('Mac OS')
    ? 'macOS'
    : ua.includes('Windows')
      ? 'Windows'
      : ua.includes('Android')
        ? 'Android'
        : ua.includes('iPhone') || ua.includes('iPad')
          ? 'iOS'
          : ua.includes('Linux')
            ? 'Linux'
            : '未知系统';
  const browser = ua.includes('Edg')
    ? 'Edge'
    : ua.includes('Firefox')
      ? 'Firefox'
      : ua.includes('Chrome')
        ? 'Chrome'
        : ua.includes('Safari')
          ? 'Safari'
          : '浏览器';
  return `${os} · ${browser}`;
}

function SecurityTab({ data, reload }: { data: ProfileData; reload: () => void }) {
  const [oldPassword, setOldPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [tip, setTip] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [oauth, setOauth] = React.useState<{ feishu: boolean; lark: boolean; github: boolean }>({
    feishu: false,
    lark: false,
    github: false,
  });

  React.useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((res) => {
        if (res?.code === 200 && res.data?.oauth) setOauth(res.data.oauth);
      })
      .catch(() => {});
  }, []);

  const changePassword = async () => {
    if (busy) return;
    if (newPassword !== confirmPassword) {
      setTip({ ok: false, text: '两次输入的新密码不一致' });
      return;
    }
    setBusy(true);
    setTip(null);
    try {
      const r = await fetch('/api/auth/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const res = await r.json();
      setTip({ ok: res?.code === 200, text: res?.message || '修改失败' });
      if (res?.code === 200) {
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        reload();
      }
    } catch {
      setTip({ ok: false, text: '网络异常，请重试' });
    } finally {
      setBusy(false);
    }
  };

  /* 解绑第三方登录：feishu/lark 共用 larkUnionId 列（provider 传 'lark'），github 独立一列。 */
  const unbind = async (provider: 'lark' | 'github', label: string) => {
    if (busy || !window.confirm(`确定解绑${label}吗？解绑后将不能通过该方式登录本账号。`)) return;
    setBusy(true);
    setTip(null);
    try {
      const r = await fetch('/api/auth/profile/unbind-oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const res = await r.json();
      setTip({ ok: res?.code === 200, text: res?.message || '解绑失败' });
      if (res?.code === 200) reload();
    } catch {
      setTip({ ok: false, text: '网络异常，请重试' });
    } finally {
      setBusy(false);
    }
  };

  const bindable: { key: string; label: string; href?: string }[] = [
    ...(oauth.feishu ? [{ key: 'feishu', label: '飞书', href: '/api/auth/feishu/login' }] : []),
    ...(oauth.lark ? [{ key: 'lark', label: 'Lark', href: '/api/auth/lark/login' }] : []),
    ...(oauth.github
      ? [{ key: 'github', label: 'GitHub', href: '/api/auth/github/login' }]
      : [{ key: 'github', label: 'GitHub' }]),
    { key: 'google', label: 'Google' },
    { key: 'apple', label: 'Apple' },
    { key: 'wechat', label: '微信' },
    { key: 'dingtalk', label: '钉钉' },
  ];

  // 各 provider 绑定状态：feishu/lark 同看 oauthBound，github 看 githubBound
  const boundMap: Record<string, boolean> = {
    feishu: data.user.oauthBound,
    lark: data.user.oauthBound,
    github: data.user.githubBound,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 两步验证（占位） */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-[16px]">两步验证（TOTP）</CardTitle>
          <div className="flex items-center gap-2.5">
            <Badge>未开启</Badge>
            <Button variant="primary" disabled title="即将上线">
              开启两步验证
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription>使用验证器 App 生成动态码，为账号增加一层保护。</CardDescription>
        </CardContent>
      </Card>

      {/* 登录密码 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-[16px]">登录密码</CardTitle>
            <CardDescription>定期更换密码，保障账号安全。</CardDescription>
          </div>
          <KeyRound size={16} className="flex-none text-fg-3" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data.user.hasPassword && (
            <Field label="旧密码">
              <Input
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
            </Field>
          )}
          <Field label="新密码">
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <Field label="确认新密码">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>
          {tip && (
            <div
              className="rounded-lg px-3 py-2 text-[12.5px]"
              style={{
                background: tip.ok ? 'var(--success-50)' : 'var(--danger-50)',
                color: tip.ok ? 'var(--success-500)' : 'var(--danger)',
              }}
            >
              {tip.text}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="primary" onClick={changePassword} disabled={!newPassword || busy}>
              {data.user.hasPassword ? '修改密码' : '设置密码'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 已绑定登录方式 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[16px]">已绑定登录方式</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.user.oauthBound && (
            <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5">
              <span
                className="grid h-5 w-5 flex-none place-items-center rounded-full text-[10px] font-bold text-white"
                style={{ background: 'var(--brand-blue)' }}
              >
                飞
              </span>
              <span className="text-[13.5px] text-fg-1">飞书 / Lark</span>
              <span className="flex-1" />
              <Button variant="secondary" size="sm" onClick={() => unbind('lark', '飞书/Lark')} disabled={busy}>
                解绑
              </Button>
            </div>
          )}
          {data.user.githubBound && (
            <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5">
              <Github size={16} className="flex-none text-fg-1" />
              <span className="text-[13.5px] text-fg-1">GitHub</span>
              <span className="flex-1" />
              <Button variant="secondary" size="sm" onClick={() => unbind('github', 'GitHub')} disabled={busy}>
                解绑
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] text-fg-3">绑定新的登录方式</span>
            <div className="flex flex-wrap gap-2">
              {bindable.map((b) =>
                b.href && !boundMap[b.key] ? (
                  <Button key={b.key} variant="secondary" size="sm" onClick={() => (window.location.href = b.href!)}>
                    {b.label}
                  </Button>
                ) : (
                  <Button
                    key={b.key}
                    variant="secondary"
                    size="sm"
                    disabled
                    title={b.href ? '已绑定' : '即将上线'}
                  >
                    {b.label}
                  </Button>
                ),
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 活跃会话（仅当前会话） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[16px]">活跃会话</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5">
            <ShieldCheck size={15} className="flex-none text-fg-3" />
            <span className="text-[13.5px] text-fg-1">{parseUA(navigator.userAgent)}</span>
            <Badge tone="blue">当前会话</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = React.useState<'profile' | 'security'>(
    searchParams.get('tab') === 'security' ? 'security' : 'profile',
  );
  const [data, setData] = React.useState<ProfileData | null>(null);
  const bindConflict = searchParams.get('error') === 'bind';

  const reload = React.useCallback(() => {
    fetchProfile().then((d) => d && setData(d));
  }, []);

  React.useEffect(reload, [reload]);

  return (
    <div className="mx-auto w-full max-w-[880px] px-6 py-8">
      <h1 className="m-0 text-[22px] font-semibold tracking-tight text-fg-1">个人资料</h1>
      <p className="mb-5 mt-1 text-[13px] text-fg-3">管理你的资料、安全与应用授权</p>

      <div className="mb-5 inline-flex gap-0.5 rounded-lg bg-surface-2 p-1">
        <SegBtn active={tab === 'profile'} onClick={() => setTab('profile')}>
          资料
        </SegBtn>
        <SegBtn active={tab === 'security'} onClick={() => setTab('security')}>
          安全
        </SegBtn>
      </div>

      {tab === 'security' && bindConflict && (
        <div className="mb-4 rounded-lg bg-danger-50 px-3 py-2 text-[12.5px] text-danger">
          绑定失败：该第三方账号已被其他用户绑定
        </div>
      )}

      {!data ? (
        <div className="skeleton h-[320px] w-full rounded-lg" />
      ) : tab === 'profile' ? (
        <ProfileTab key={data.user.name ?? ''} data={data} reload={reload} />
      ) : (
        <SecurityTab data={data} reload={reload} />
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <React.Suspense fallback={null}>
      <ProfileInner />
    </React.Suspense>
  );
}
