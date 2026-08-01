'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SegBtn } from '@/components/ui/segmented';
import { applyTheme, readThemePref, type ThemePref } from '@/lib/theme';
import { applyUpColor, type UpColorPref } from '@/lib/updown';
import { PermMatrixTab } from './perm-matrix-tab';
import { RolesDictTab } from './roles-dict-tab';
import { UsersManageTab } from './users-manage-tab';

/* 设置页：偏好 + 用户管理/权限矩阵/角色字典（后三个仅 admin 可见/可操作）。
   资讯管理/行情管理/龙虎榜管理已迁移到 /data「数据管理」页。
   主题（lib/theme）与涨跌配色（lib/updown）真实生效；语言、时区、语言切换器、
   通知偏好目前无对应体系，持久化在 localStorage('vius-prefs') 仅作占位。 */

interface Prefs {
  language: string;
  timezone: string;
  langSwitcher: boolean;
  emailNotify: boolean;
  upColor: UpColorPref;
}

const PREFS_KEY = 'vius-prefs';
const DEFAULT_PREFS: Prefs = {
  language: 'zh-CN',
  timezone: 'Asia/Shanghai',
  langSwitcher: true,
  emailNotify: false,
  upColor: 'red',
};

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    // 隐私模式等场景 —— 落到默认值
  }
  return DEFAULT_PREFS;
}

/* 一行设置项：左标题（+可选描述），右控件。 */
function Row({
  label,
  desc,
  children,
  last,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-6 py-3.5"
      style={last ? undefined : { borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[13.5px] font-medium text-fg-1">{label}</span>
        {desc && <span className="text-[12px] text-fg-3">{desc}</span>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const [theme, setTheme] = React.useState<ThemePref>('light');
  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULT_PREFS);
  const [tab, setTab] = React.useState<'prefs' | 'users' | 'perms' | 'roles'>('prefs');
  const [role, setRole] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTheme(readThemePref());
    setPrefs(readPrefs());
    // 管理类 tab 仅 admin 可见（接口侧 requireAdmin 兜底）
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(json => {
        const user = json?.data?.user ?? json?.user ?? json?.data ?? null;
        if (user?.role) setRole(user.role);
      })
      .catch(() => {});
  }, []);

  const updatePrefs = (patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // 无法持久化时仅本次生效
      }
      return next;
    });
  };

  const changeTheme = (v: string) => {
    const pref = (v === 'dark' || v === 'system' ? v : 'light') as ThemePref;
    setTheme(pref);
    applyTheme(pref);
  };

  return (
    <div className="mx-auto w-full max-w-[880px] px-6 py-8">
      <h1 className="m-0 text-[22px] font-semibold tracking-tight text-fg-1">设置</h1>
      <p className="mb-5 mt-1 text-[13px] text-fg-3">管理通用偏好、通知与隐私</p>

      <div className="mb-5 inline-flex gap-0.5 rounded-lg bg-surface-2 p-1">
        <SegBtn active={tab === 'prefs'} onClick={() => setTab('prefs')}>偏好</SegBtn>
        {role === 'admin' && (
          <SegBtn active={tab === 'users'} onClick={() => setTab('users')}>用户管理</SegBtn>
        )}
        {role === 'admin' && (
          <SegBtn active={tab === 'perms'} onClick={() => setTab('perms')}>权限矩阵</SegBtn>
        )}
        {role === 'admin' && (
          <SegBtn active={tab === 'roles'} onClick={() => setTab('roles')}>角色字典</SegBtn>
        )}
      </div>

      {tab === 'users' && role === 'admin' ? (
        <UsersManageTab />
      ) : tab === 'perms' && role === 'admin' ? (
        <PermMatrixTab />
      ) : tab === 'roles' && role === 'admin' ? (
        <RolesDictTab />
      ) : (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">通用</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label="语言">
              <Select value={prefs.language} onValueChange={(v) => updatePrefs({ language: v })}>
                <SelectTrigger className="w-[180px]" />
                <SelectContent>
                  <SelectItem value="zh-CN">简体中文</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="时区">
              <Select value={prefs.timezone} onValueChange={(v) => updatePrefs({ timezone: v })}>
                <SelectTrigger className="w-[180px]" />
                <SelectContent>
                  <SelectItem value="Asia/Shanghai">Asia/Shanghai</SelectItem>
                  <SelectItem value="Asia/Hong_Kong">Asia/Hong_Kong</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="主题">
              <Select value={theme} onValueChange={changeTheme}>
                <SelectTrigger className="w-[180px]" />
                <SelectContent>
                  <SelectItem value="light">浅色</SelectItem>
                  <SelectItem value="dark">深色</SelectItem>
                  <SelectItem value="system">跟随系统</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            {/* 涨跌配色：改动即写回 vius-prefs 并翻转 --up/--down CSS 变量，全局立即生效 */}
            <Row label="涨跌配色" desc="行情涨跌数字与板块的颜色方向">
              <Select
                value={prefs.upColor}
                onValueChange={(v) => {
                  const pref = (v === 'green' ? 'green' : 'red') as UpColorPref;
                  updatePrefs({ upColor: pref });
                  applyUpColor(pref);
                }}
              >
                <SelectTrigger className="w-[180px]" />
                <SelectContent>
                  <SelectItem value="red">红涨绿跌</SelectItem>
                  <SelectItem value="green">绿涨红跌</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="语言切换器" desc="在左上角显示语言切换菜单" last>
              <Switch
                checked={prefs.langSwitcher}
                onCheckedChange={(v) => updatePrefs({ langSwitcher: v })}
              />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-[16px]">通知偏好</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label="站内通知" desc="收件箱与铃铛实时提醒（始终开启）">
              <Switch checked onCheckedChange={() => {}} disabled />
            </Row>
            <Row label="邮件通知" desc="重要通知同时发送到邮箱" last>
              <Switch
                checked={prefs.emailNotify}
                onCheckedChange={(v) => updatePrefs({ emailNotify: v })}
              />
            </Row>
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}
