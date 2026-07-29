'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MailPlus, Plus } from 'lucide-react';

/* 设置页「用户管理」tab（仅 admin 渲染；接口侧由 requireAdmin 兜底）。
   维护登录账号：新增/改角色/重置密码/删除；角色选项来自 GET /api/roles。
   邀请功能：填邮箱形成 OAuth 注册白名单（三方登录邮箱须命中 pending 邀请才放行）。 */

interface UserItem {
  id: string;
  username: string;
  name: string | null;
  role: string;
  createdAt: string;
  primaryEmail: string | null;
}

interface RoleItem {
  id: string;
  key: string;
  name: string;
  builtin: boolean;
  userCount: number;
}

interface InvitationItem {
  id: string;
  email: string;
  status: string; // pending / accepted
  createdAt: string;
  acceptedAt: string | null;
}

interface UserForm {
  username: string;
  name: string;
  password: string;
  role: string;
}

const EMPTY_FORM: UserForm = { username: '', name: '', password: '', role: 'member' };

export function UsersManageTab() {
  const [users, setUsers] = React.useState<UserItem[] | null>(null);
  const [roles, setRoles] = React.useState<RoleItem[]>([]);
  const [invitations, setInvitations] = React.useState<InvitationItem[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  // 当前登录用户名（自己那行禁止删除，接口侧同样兜底）
  const [me, setMe] = React.useState<string | null>(null);

  // 新增用户弹窗
  const [addOpen, setAddOpen] = React.useState(false);
  const [form, setForm] = React.useState<UserForm>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  // 邀请用户弹窗
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviting, setInviting] = React.useState(false);

  // 重置密码弹窗
  const [pwdTarget, setPwdTarget] = React.useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = React.useState('');
  const [pwdSaving, setPwdSaving] = React.useState(false);

  const fetchAll = React.useCallback(async () => {
    try {
      const [usersRes, rolesRes, invitationsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/roles'),
        fetch('/api/users/invitations'),
      ]);
      const usersJson = await usersRes.json();
      const rolesJson = await rolesRes.json();
      const invitationsJson = await invitationsRes.json();
      if (usersJson.code !== 200) throw new Error(usersJson.message || '获取用户列表失败');
      if (rolesJson.code !== 200) throw new Error(rolesJson.message || '获取角色列表失败');
      if (invitationsJson.code !== 200) throw new Error(invitationsJson.message || '获取邀请列表失败');
      // setState 一律发生在 await 之后（避免 effect 首次同步调用级联渲染）
      setError(null);
      setUsers(usersJson.data);
      setRoles(rolesJson.data);
      setInvitations(invitationsJson.data);
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

  React.useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(json => {
        const user = json?.data?.user ?? json?.user ?? null;
        if (user?.username) setMe(user.username);
      })
      .catch(() => {});
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  // 角色列即改即存
  const handleRoleChange = async (u: UserItem, role: string) => {
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
    const json = await res.json();
    if (json.code !== 200) {
      alert(json.message || '修改角色失败');
      return;
    }
    flash(`已将「${u.username}」的角色改为 ${role}`);
    await fetchAll();
  };

  const handleAdd = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          role: form.role,
          ...(form.name.trim() ? { name: form.name.trim() } : {})
        })
      });
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.message || '创建失败');
      setAddOpen(false);
      setForm(EMPTY_FORM);
      flash(`用户「${form.username}」已创建`);
      await fetchAll();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // 提交邀请：邮箱加入 OAuth 注册白名单
  const handleInvite = async () => {
    setInviting(true);
    try {
      const res = await fetch('/api/users/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail })
      });
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.message || '邀请失败');
      setInviteOpen(false);
      setInviteEmail('');
      flash(`已邀请「${inviteEmail.trim()}」`);
      await fetchAll();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setInviting(false);
    }
  };

  // 删除邀请（仅 pending；accepted 留档审计，按钮已禁用，接口侧同样兜底）
  const handleDeleteInvitation = async (inv: InvitationItem) => {
    if (!confirm(`确定删除对「${inv.email}」的邀请？`)) return;
    const res = await fetch(`/api/users/invitations/${inv.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.code !== 200) {
      alert(json.message || '删除失败');
      return;
    }
    flash(`已删除对「${inv.email}」的邀请`);
    await fetchAll();
  };

  const handleResetPassword = async () => {
    if (!pwdTarget) return;
    setPwdSaving(true);
    try {
      const res = await fetch(`/api/users/${pwdTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      const json = await res.json();
      if (json.code !== 200) throw new Error(json.message || '重置密码失败');
      setPwdTarget(null);
      setNewPassword('');
      flash(`已重置「${pwdTarget.username}」的密码`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPwdSaving(false);
    }
  };

  const handleDelete = async (u: UserItem) => {
    if (!confirm(`确定删除用户「${u.username}」？其股票池、持仓等数据将一并清除，不可恢复。`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.code !== 200) {
      alert(json.message || '删除失败');
      return;
    }
    flash(`已删除「${u.username}」`);
    await fetchAll();
  };

  if (error) {
    return <div className="py-10 text-center text-[13px] text-danger">{error}</div>;
  }
  if (!users) {
    return <div className="py-10 text-center text-[13px] text-fg-3">加载中…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 标题 + 邀请/新增按钮 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="m-0 text-[16px] font-semibold text-fg-1">用户管理</h2>
          <p className="mt-1 text-[12.5px] text-fg-3">维护登录账号与角色；角色决定各模块的访问权限</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={() => { setInviteEmail(''); setInviteOpen(true); }}>
            <MailPlus size={14} />
            邀请用户
          </Button>
          <Button size="md" onClick={() => { setForm(EMPTY_FORM); setAddOpen(true); }}>
            <Plus size={14} />
            新增用户
          </Button>
        </div>
      </div>

      {notice && <div className="text-[12.5px] text-success">{notice}</div>}

      {/* 用户列表 */}
      <Card>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-fg-3">暂无用户</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>主邮箱</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.name ?? '-'}</TableCell>
                    <TableCell>
                      <Select value={u.role} onValueChange={v => handleRoleChange(u, v)}>
                        <SelectTrigger className="h-8 w-[130px]" />
                        <SelectContent>
                          {roles.map(r => (
                            <SelectItem key={r.key} value={r.key}>{r.name}（{r.key}）</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-fg-2">{u.primaryEmail ?? '-'}</TableCell>
                    <TableCell className="text-fg-3">
                      {new Date(u.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => { setPwdTarget(u); setNewPassword(''); }}
                        >
                          重置密码
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-danger"
                          disabled={u.username === me}
                          title={u.username === me ? '不能删除当前登录账号' : undefined}
                          onClick={() => handleDelete(u)}
                        >
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 邀请记录 */}
      <div>
        <h3 className="m-0 text-[14px] font-semibold text-fg-1">邀请记录</h3>
        <p className="mt-1 text-[12.5px] text-fg-3">
          被邀请邮箱可通过 飞书 / Lark / GitHub 登录；仅待接受的邀请可删除，已接受的留档审计
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          {invitations.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-fg-3">暂无邀请记录</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>邮箱</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>邀请时间</TableHead>
                  <TableHead>接受时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      {inv.status === 'accepted' ? (
                        <Badge tone="success">已接受</Badge>
                      ) : (
                        <Badge tone="blue">待接受</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-fg-3">
                      {new Date(inv.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </TableCell>
                    <TableCell className="text-fg-3">
                      {inv.acceptedAt
                        ? new Date(inv.acceptedAt).toLocaleString('zh-CN', { hour12: false })
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-danger"
                        disabled={inv.status !== 'pending'}
                        title={inv.status !== 'pending' ? '已接受的邀请不可删除' : undefined}
                        onClick={() => handleDeleteInvitation(inv)}
                      >
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 邀请用户弹窗 */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="w-[420px] bg-surface border-border p-6">
          <div className="text-[15px] font-semibold text-fg-1">邀请用户</div>
          <div className="space-y-4 py-4">
            <p className="m-0 text-[13px] text-fg-3">
              被邀请邮箱可通过 飞书 / Lark / GitHub 登录；首次登录自动建号，已注册用户自动绑定
            </p>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">邮箱 <span className="text-danger">*</span></label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>取消</Button>
            <Button onClick={handleInvite} disabled={!inviteEmail.trim() || inviting}>
              {inviting ? '提交中…' : '确认邀请'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新增用户弹窗 */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="w-[480px] bg-surface border-border p-6">
          <div className="text-[15px] font-semibold text-fg-1">新增用户</div>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">用户名 <span className="text-danger">*</span></label>
              <Input
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder="2-32 位，登录用"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">姓名</label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="可选，展示用"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">密码 <span className="text-danger">*</span></label>
              <Input
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="至少 6 位"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">角色 <span className="text-danger">*</span></label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                <SelectTrigger />
                <SelectContent>
                  {roles.map(r => (
                    <SelectItem key={r.key} value={r.key}>{r.name}（{r.key}）</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>取消</Button>
            <Button
              onClick={handleAdd}
              disabled={form.username.trim().length < 2 || form.password.length < 6 || saving}
            >
              {saving ? '保存中…' : '确认'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 重置密码弹窗 */}
      <Dialog open={pwdTarget !== null} onOpenChange={open => { if (!open) setPwdTarget(null); }}>
        <DialogContent className="w-[420px] bg-surface border-border p-6">
          <div className="text-[15px] font-semibold text-fg-1">重置密码</div>
          <div className="space-y-4 py-4">
            <p className="m-0 text-[13px] text-fg-3">
              为用户「{pwdTarget?.username}」设置新密码，生效后旧密码立即失效
            </p>
            <div className="space-y-1.5">
              <label className="text-[13px] text-fg-2">新密码 <span className="text-danger">*</span></label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="至少 6 位"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPwdTarget(null)}>取消</Button>
            <Button onClick={handleResetPassword} disabled={newPassword.length < 6 || pwdSaving}>
              {pwdSaving ? '保存中…' : '确认'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
