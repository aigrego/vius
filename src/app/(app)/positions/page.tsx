'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Position } from '@/types/stock-pool/position';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { StockDetailModal } from '@/components/stock-pool/stock-detail-modal';
import {
  Plus, Search, RefreshCw, TrendingUp, Wallet, BarChart3, ListChecks,
  Edit2, Trash2, Activity, Clock, Database
} from 'lucide-react';

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [detailStock, setDetailStock] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [formData, setFormData] = useState({ code: '', price: '', quantity: '' });

  // 持仓股票实时行情轮询（5秒间隔）
  const { data: realtimeData, meta: realtimeMeta, loading: realtimeLoading, lastUpdated } =
    useRealtimeData({ interval: 5000, url: '/stock-pool/api/positions/realtime' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/stock-pool/api/positions');
      const result = await res.json();
      if (result.success) setPositions(result.data);
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      alert('加载数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 合并实时行情到持仓记录
  const mergedPositions = positions.map(p => {
    const realtime = realtimeData[p.code];
    if (!realtime) return p;
    return {
      ...p,
      current: realtime.current,
      changePct: realtime.changePct
    };
  });

  // 汇总统计
  const stats = positions.reduce((acc, p) => {
    const current = realtimeData[p.code]?.current;
    const cost = p.price * p.quantity;
    acc.records += 1;
    acc.totalCost += cost;
    if (current) {
      acc.totalValue += current * p.quantity;
      acc.pricedCost += cost;
    }
    return acc;
  }, { records: 0, totalCost: 0, totalValue: 0, pricedCost: 0 });
  const stocks = new Set(positions.map(p => p.code)).size;
  const totalPnl = stats.totalValue - stats.pricedCost;
  const totalPnlPct = stats.pricedCost > 0 ? totalPnl / stats.pricedCost * 100 : 0;

  // 过滤
  const filteredPositions = mergedPositions.filter(p => {
    return !search ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase());
  });

  const handleSave = async () => {
    try {
      setSaving(true);
      // 编辑走 PUT（仅买入价/数量），新建走 POST
      const url = editingPosition
        ? `/stock-pool/api/positions/${editingPosition.id}`
        : '/stock-pool/api/positions';
      const res = await fetch(url, {
        method: editingPosition ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code.trim(),
          price: parseFloat(formData.price),
          quantity: parseInt(formData.quantity, 10)
        })
      });

      if (res.ok) {
        setDialogOpen(false);
        setEditingPosition(null);
        setFormData({ code: '', price: '', quantity: '' });
        fetchData();
      } else {
        const result = await res.json().catch(() => null);
        alert(`保存失败：${result?.error || res.statusText}`);
      }
    } catch (error) {
      console.error('Failed to save position:', error);
      alert('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => {
    setEditingPosition(null);
    setFormData({ code: '', price: '', quantity: '' });
    setDialogOpen(true);
  };

  const openEdit = (position: Position) => {
    setEditingPosition(position);
    setFormData({
      code: position.code,
      price: String(position.price),
      quantity: String(position.quantity)
    });
    setDialogOpen(true);
  };

  const handleDelete = async (position: Position) => {
    if (!confirm(`确定要删除 ${position.name}(${position.code}) 的这条持仓记录吗？`)) return;

    try {
      const res = await fetch(`/stock-pool/api/positions/${position.id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        const result = await res.json().catch(() => null);
        alert(`删除失败：${result?.error || res.statusText}`);
      }
    } catch (error) {
      console.error('Failed to delete position:', error);
      alert('删除失败，请稍后重试');
    }
  };

  const openDetail = (position: Position) => {
    const realtime = realtimeData[position.code];
    setDetailStock({
      ...position,
      current: realtime?.current,
      changePct: realtime?.changePct ?? 0,
      pnlPct: 0,
      pnlAmount: 0
    });
    setDetailOpen(true);
  };

  const canSubmit = formData.code.trim() && parseFloat(formData.price) > 0 && parseInt(formData.quantity, 10) > 0;

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-lg">
              💼
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">持仓股</h1>
              <p className="text-xs text-fg-3">Position Manager</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 股票池入口 */}
            <Button variant="secondary" size="sm" asChild className="hidden sm:flex">
              <Link href="/pool">
                <ListChecks className="w-4 h-4 mr-2" />
                股票池
              </Link>
            </Button>

            {/* A股数据总览入口 */}
            <Button variant="secondary" size="sm" asChild className="hidden sm:flex">
              <Link href="/ashare">
                <Database className="w-4 h-4 mr-2" />
                A股总览
              </Link>
            </Button>

            {/* 实时数据状态 */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                !realtimeLoading
                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                  : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
              }`}
              title={`数据源: ${realtimeMeta?.source || 'unknown'} | 成功: ${realtimeMeta?.count || 0}/${realtimeMeta?.total || 0}`}
            >
              <Activity className="w-4 h-4" />
              <span className="text-sm hidden sm:inline">
                {realtimeLoading ? '更新中...' : (realtimeMeta?.source || '实时')}
              </span>
            </div>

            {/* 最后更新时间 */}
            {lastUpdated && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 text-xs text-fg-3">
                <Clock className="w-3 h-3" />
                {lastUpdated.toLocaleTimeString('zh-CN')}
              </div>
            )}

            <Button onClick={openAdd} className="gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">添加持仓</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                持仓股票
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stocks}</div>
              <p className="text-xs text-fg-3 mt-1">{stats.records} 条买入记录</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                总投入
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">¥{stats.totalCost.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                总市值
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {stats.totalValue > 0 ? `¥${stats.totalValue.toFixed(2)}` : '-'}
              </div>
            </CardContent>
          </Card>

          {/* 总盈亏卡片：涨跌色随设置页「涨跌配色」翻转（--up/--down，默认红涨绿跌） */}
          <Card className={`bg-gradient-to-br ${totalPnl >= 0 ? 'from-up/10 to-up/5 border-up/20' : 'from-down/10 to-down/5 border-down/20'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                总盈亏
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${totalPnl >= 0 ? 'text-up' : 'text-down'}`}>
                {stats.totalValue > 0 ? `${totalPnl >= 0 ? '+' : ''}¥${totalPnl.toFixed(2)}` : '-'}
              </div>
              {stats.totalValue > 0 && (
                <p className={`text-xs mt-1 ${totalPnlPct >= 0 ? 'text-up' : 'text-down'}`}>
                  {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-3" />
                <Input
                  placeholder="搜索代码或名称..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="secondary" size="icon" onClick={fetchData}>
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Position Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[100px]">代码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead className="w-[80px]">市场</TableHead>
                  <TableHead className="text-right">买入价</TableHead>
                  <TableHead className="text-right">买入数量</TableHead>
                  <TableHead className="text-right">投入金额</TableHead>
                  <TableHead className="text-right">当前价</TableHead>
                  <TableHead className="text-right">涨跌幅</TableHead>
                  <TableHead className="text-right">浮动盈亏</TableHead>
                  <TableHead className="text-right">买入时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPositions.map((p) => {
                  const amount = p.price * p.quantity;
                  const pnl = p.current !== undefined ? (p.current - p.price) * p.quantity : undefined;
                  const pnlPct = p.current !== undefined && p.price > 0
                    ? (p.current - p.price) / p.price * 100
                    : undefined;
                  const isProfit = (pnl || 0) >= 0;
                  const isUp = (p.changePct || 0) > 0;

                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => openDetail(p)}
                    >
                      <TableCell className="font-mono font-medium">{p.code}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>
                        <Badge tone="neutral">{p.market.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">¥{p.price.toFixed(3)}</TableCell>
                      <TableCell className="text-right font-mono">{p.quantity}</TableCell>
                      <TableCell className="text-right font-mono">¥{amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {p.current ? `¥${p.current.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${isUp ? 'text-up' : 'text-down'}`}>
                        {p.changePct !== undefined ? `${isUp ? '+' : ''}${p.changePct.toFixed(2)}%` : '-'}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${isProfit ? 'text-up' : 'text-down'}`}>
                        {pnl !== undefined
                          ? `${isProfit ? '+' : ''}¥${pnl.toFixed(2)} (${isProfit ? '+' : ''}${pnlPct!.toFixed(2)}%)`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right text-xs text-fg-3">
                        {new Date(p.createdAt).toLocaleString('zh-CN')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400"
                            onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredPositions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-fg-3">
                      {loading ? '加载中...' : '暂无持仓记录，点击右上角「添加持仓」开始'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      {/* Add/Edit Dialog（vius Dialog 无 Header/Title 子组件，内容自行补 padding） */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-surface border-border p-6">
          <div className="text-[15px] font-semibold">{editingPosition ? '编辑持仓' : '添加持仓'}</div>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm text-fg-3">股票代码</label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="如: 600519"
                disabled={!!editingPosition}
              />
              {!editingPosition && (
                <p className="text-xs text-fg-3">名称、市场将自动识别；同一股票可添加多条买入记录</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-fg-3">买入价</label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="如: 1680.50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-fg-3">买入数量</label>
                <Input
                  type="number"
                  step="100"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="如: 100"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setDialogOpen(false); setEditingPosition(null); }}>取消</Button>
            <Button onClick={handleSave} disabled={!canSubmit || saving}>
              {saving ? '保存中...' : (editingPosition ? '保存' : '添加')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stock Detail Modal */}
      <StockDetailModal
        stock={detailStock}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
