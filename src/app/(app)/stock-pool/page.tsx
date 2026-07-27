'use client';

import { useState, useEffect, ComponentProps } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
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
import { Stock, StockStats, TypeLabels, MarketType, StockType, DefaultAlerts } from '@/types/stock-pool/stock';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { StockDetailModal } from '@/components/stock-pool/stock-detail-modal';
import {
  Plus, Search, RefreshCw, TrendingUp, Wallet, BarChart3, Globe,
  Edit2, Trash2, Bell, Activity, Clock, AlertTriangle, History, LineChart, Database
} from 'lucide-react';

type BadgeTone = ComponentProps<typeof Badge>['tone'];

export default function StockPoolPage() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [stats, setStats] = useState<StockStats>({ total: 0, withPosition: 0, etfs: 0, hkUs: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [marketFilter, setMarketFilter] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<Stock | null>(null);
  const [detailStock, setDetailStock] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [alertChecking, setAlertChecking] = useState(false);
  const [alertResult, setAlertResult] = useState<any>(null);
  const [alertHistoryOpen, setAlertHistoryOpen] = useState(false);
  const [alertHistory, setAlertHistory] = useState<any[]>([]);

  // 实时数据轮询（5秒间隔）
  const { data: realtimeData, meta: realtimeMeta, loading: realtimeLoading, lastUpdated, refresh: refreshRealtime } = useRealtimeData({ interval: 5000 });

  const [formData, setFormData] = useState<Partial<Stock>>({
    code: '',
    name: '',
    market: 'sh',
    type: 'individual',
    cost: 0,
    alerts: DefaultAlerts
  });

  // 请求通知权限
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, []);

  const requestNotification = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [stocksRes, statsRes] = await Promise.all([
        fetch('/stock-pool/api/stocks'),
        fetch('/stock-pool/api/stats')
      ]);

      const stocksData = await stocksRes.json();
      const statsData = await statsRes.json();

      if (stocksData.success) setStocks(stocksData.data);
      if (statsData.success) setStats(statsData.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      alert('加载数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 合并实时数据到股票列表
  const mergedStocks = stocks.map(stock => {
    const realtime = realtimeData[stock.code];
    if (!realtime) return stock;
    return {
      ...stock,
      current: realtime.current,
      change: realtime.current - (realtime.close || 0),
      changePct: realtime.changePct,
      pnlPct: realtime.pnlPct,
      pnlAmount: realtime.pnlAmount
    };
  });

  // 过滤
  const filteredStocks = mergedStocks.filter(stock => {
    const matchSearch = !search ||
      stock.code.toLowerCase().includes(search.toLowerCase()) ||
      stock.name.toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || stock.type === typeFilter;
    const matchMarket = !marketFilter || stock.market === marketFilter;
    return matchSearch && matchType && matchMarket;
  });

  const handleSave = async () => {
    try {
      const url = editingStock
        ? `/stock-pool/api/stocks/${editingStock.code}`
        : '/stock-pool/api/stocks';
      const method = editingStock ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setDialogOpen(false);
        setEditingStock(null);
        setFormData({ code: '', name: '', market: 'sh', type: 'individual', cost: 0, alerts: DefaultAlerts });
        fetchData();
      } else {
        const result = await res.json().catch(() => null);
        alert(`保存失败：${result?.error || res.statusText}`);
      }
    } catch (error) {
      console.error('Failed to save stock:', error);
      alert('保存失败，请稍后重试');
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm(`确定要删除 ${code} 吗？`)) return;

    try {
      const res = await fetch(`/stock-pool/api/stocks/${code}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        const result = await res.json().catch(() => null);
        alert(`删除失败：${result?.error || res.statusText}`);
      }
    } catch (error) {
      console.error('Failed to delete stock:', error);
      alert('删除失败，请稍后重试');
    }
  };

  const openEdit = (stock: Stock) => {
    setEditingStock(stock);
    setFormData(stock);
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditingStock(null);
    setFormData({ code: '', name: '', market: 'sh', type: 'individual', cost: 0, alerts: DefaultAlerts });
    setDialogOpen(true);
  };

  const openDetail = (stock: any) => {
    setDetailStock(stock);
    setDetailOpen(true);
  };

  // 手动检查预警
  const checkAlerts = async () => {
    try {
      setAlertChecking(true);
      const res = await fetch('/stock-pool/api/alerts/check?force=true');
      const result = await res.json();
      setAlertResult(result);

      if (result.alertsFound > 0) {
        alert(`发现 ${result.alertsFound} 条预警！`);
      } else {
        alert('暂无预警触发');
      }
    } catch (error) {
      console.error('Check alerts failed:', error);
      alert('检查预警失败');
    } finally {
      setAlertChecking(false);
    }
  };

  // 获取预警历史
  const fetchAlertHistory = async () => {
    try {
      const res = await fetch('/stock-pool/api/alerts/history?hours=24');
      const result = await res.json();
      if (result.success) {
        setAlertHistory(result.data);
        setAlertHistoryOpen(true);
      }
    } catch (error) {
      console.error('Fetch alert history failed:', error);
      alert('获取预警历史失败');
    }
  };

  // vius 的 Badge 用 tone 而非 variant，按市场/类型映射色调
  const getMarketBadgeTone = (market: string): BadgeTone => {
    const tones: Record<string, BadgeTone> = {
      sh: 'blue',
      sz: 'success',
      hk: 'purple',
      us: 'warning',
      fx: 'blue',
      bj: 'danger',
    };
    return tones[market] || 'neutral';
  };

  const getTypeBadgeTone = (type: string): BadgeTone => {
    const tones: Record<string, BadgeTone> = {
      individual: 'blue',
      etf: 'blue',
      gold: 'warning',
    };
    return tones[type] || 'neutral';
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-lg">
              📊
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">股票池</h1>
              <p className="text-xs text-fg-3">Stock Pool Manager</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 市场分析入口 */}
            <Button variant="secondary" size="sm" asChild className="hidden sm:flex">
              <Link href="/stock-pool/analysis">
                <LineChart className="w-4 h-4 mr-2" />
                市场分析
              </Link>
            </Button>

            {/* A股数据总览入口 */}
            <Button variant="secondary" size="sm" asChild className="hidden sm:flex">
              <Link href="/stock-pool/ashare">
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

            {/* 通知权限 */}
            {typeof window !== 'undefined' && 'Notification' in window && (
              <Button
                variant="ghost"
                size="icon"
                onClick={requestNotification}
                className={notificationsEnabled ? 'text-green-400' : 'text-fg-3'}
              >
                <Bell className="w-5 h-5" />
              </Button>
            )}

            {/* 预警检查 */}
            <Button
              variant="secondary"
              size="sm"
              onClick={checkAlerts}
              disabled={alertChecking}
              className="hidden sm:flex"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              {alertChecking ? '检查中...' : '检查预警'}
            </Button>

            {/* 预警历史 */}
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchAlertHistory}
              className="hidden sm:flex"
            >
              <History className="w-4 h-4 mr-2" />
              历史
            </Button>

            <Button onClick={openAdd} className="gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">添加股票</span>
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
                持仓数量
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.withPosition}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                ETF/基金
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.etfs}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <Globe className="w-4 h-4" />
                港股/美股
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.hkUs}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                总计
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
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
              <div className="flex gap-2">
                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v || '')}>
                  <SelectTrigger className="w-[130px]" placeholder="类型" />
                  <SelectContent>
                    <SelectItem value="">全部</SelectItem>
                    <SelectItem value="individual">个股</SelectItem>
                    <SelectItem value="etf">ETF</SelectItem>
                    <SelectItem value="gold">黄金</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={marketFilter} onValueChange={(v) => setMarketFilter(v || '')}>
                  <SelectTrigger className="w-[130px]" placeholder="市场" />
                  <SelectContent>
                    <SelectItem value="">全部</SelectItem>
                    <SelectItem value="sh">上证</SelectItem>
                    <SelectItem value="sz">深证</SelectItem>
                    <SelectItem value="hk">港股</SelectItem>
                    <SelectItem value="us">美股</SelectItem>
                    <SelectItem value="bj">北交所</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="secondary" size="icon" onClick={fetchData}>
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stock Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[100px]">代码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead className="w-[80px]">市场</TableHead>
                  <TableHead className="w-[80px]">类型</TableHead>
                  <TableHead className="text-right">当前价</TableHead>
                  <TableHead className="text-right">涨跌幅</TableHead>
                  <TableHead className="text-right">持仓成本</TableHead>
                  <TableHead className="text-right">盈亏</TableHead>
                  <TableHead className="text-right">盈亏额</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStocks.map((stock) => {
                  const isProfit = (stock.pnlPct || 0) > 0;
                  const isUp = (stock.changePct || 0) > 0;

                  return (
                    <TableRow
                      key={stock.code}
                      className="cursor-pointer"
                      onClick={() => openDetail(stock)}
                    >
                      <TableCell className="font-mono font-medium">{stock.code}</TableCell>
                      <TableCell>{stock.name}</TableCell>
                      <TableCell>
                        <Badge tone={getMarketBadgeTone(stock.market)}>
                          {stock.market.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge tone={getTypeBadgeTone(stock.type)}>
                          {TypeLabels[stock.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {stock.current ? `¥${stock.current.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                        {stock.changePct ? `${isUp ? '+' : ''}${stock.changePct.toFixed(2)}%` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {stock.cost ? `¥${Number(stock.cost).toFixed(3)}` : '-'}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                        {stock.pnlPct ? `${isProfit ? '+' : ''}${stock.pnlPct.toFixed(2)}%` : '-'}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                        {stock.pnlAmount ? `${isProfit ? '+' : ''}¥${stock.pnlAmount.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => { e.stopPropagation(); openEdit(stock); }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-400"
                            onClick={(e) => { e.stopPropagation(); handleDelete(stock.code); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredStocks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-fg-3">
                      {loading ? '加载中...' : '暂无数据'}
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
          <div className="text-[15px] font-semibold">{editingStock ? '编辑股票' : '添加股票'}</div>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-fg-3">股票代码</label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="如: 600519"
                  disabled={!!editingStock}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-fg-3">股票名称</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="如: 贵州茅台"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-fg-3">市场</label>
                <Select
                  value={formData.market}
                  onValueChange={(v) => setFormData({ ...formData, market: v as MarketType })}
                >
                  <SelectTrigger />
                  <SelectContent>
                    <SelectItem value="sh">上证</SelectItem>
                    <SelectItem value="sz">深证</SelectItem>
                    <SelectItem value="hk">港股</SelectItem>
                    <SelectItem value="us">美股</SelectItem>
                    <SelectItem value="bj">北交所</SelectItem>
                    <SelectItem value="fx">外汇</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-fg-3">类型</label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v as StockType })}
                >
                  <SelectTrigger />
                  <SelectContent>
                    <SelectItem value="individual">个股</SelectItem>
                    <SelectItem value="etf">ETF</SelectItem>
                    <SelectItem value="gold">黄金</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-fg-3">持仓成本</label>
              <Input
                type="number"
                step="0.001"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                placeholder="0.000"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave}>{editingStock ? '保存' : '添加'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Alert History Dialog */}
      <Dialog open={alertHistoryOpen} onOpenChange={setAlertHistoryOpen}>
        <DialogContent className="bg-surface border-border max-w-2xl p-6">
          <div className="text-[15px] font-semibold">预警历史 (24小时)</div>
          <div className="max-h-[400px] overflow-auto mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>股票</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>级别</TableHead>
                  <TableHead>消息</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertHistory.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell className="text-xs">
                      {new Date(alert.createdAt).toLocaleString('zh-CN')}
                    </TableCell>
                    <TableCell className="font-mono">{alert.code}</TableCell>
                    <TableCell>{alert.alertType}</TableCell>
                    <TableCell>
                      <Badge tone={
                        alert.severity === 'critical' ? 'danger' :
                        alert.severity === 'warning' ? 'warning' :
                        'blue'
                      }>
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate" title={alert.message}>
                      {alert.message}
                    </TableCell>
                  </TableRow>
                ))}
                {alertHistory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4 text-fg-3">
                      暂无预警记录
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
