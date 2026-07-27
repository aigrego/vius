'use client';

import { useCallback, useEffect, useState, ComponentProps } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StockDetailModal } from '@/components/stock-pool/stock-detail-modal';
import { RealtimeStock } from '@/hooks/useRealtimeData';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, CalendarDays, Database } from 'lucide-react';

// 信号类型：底部放量 / 顶部放量（与后端 stock_signal.type 一致）
type SignalType = 'bottom_volume' | 'top_volume';

interface SignalDetail {
  volumeRatio: number;
  position: number;
  changePct: number;
  close: number;
}

interface Signal {
  code: string;
  name: string;
  market: string;
  type: string;
  date: string;
  detail: SignalDetail;
}

const SignalTypeTabs: { value: SignalType; label: string }[] = [
  { value: 'bottom_volume', label: '底部放量' },
  { value: 'top_volume', label: '顶部放量' },
];

// detail 字段后端约定为已 parse 的对象，这里兜底兼容字符串
function parseDetail(detail: unknown): SignalDetail | null {
  if (!detail) return null;
  if (typeof detail === 'string') {
    try {
      return JSON.parse(detail) as SignalDetail;
    } catch {
      return null;
    }
  }
  return detail as SignalDetail;
}

// 位置分位可能是 0-1 小数或 0-100 百分数，统一按百分数展示
function formatPosition(position: number): string {
  const pct = position <= 1 ? position * 100 : position;
  return `${pct.toFixed(0)}%`;
}

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

type BadgeTone = ComponentProps<typeof Badge>['tone'];

export default function StockPoolAnalysisPage() {
  const [signalType, setSignalType] = useState<SignalType>('bottom_volume');
  const [date, setDate] = useState<string>(todayString());
  const [signals, setSignals] = useState<Signal[]>([]);
  const [actualDate, setActualDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailStock, setDetailStock] = useState<RealtimeStock | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchSignals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ type: signalType, date, limit: '100' });
      const res = await fetch(`/api/ashare/signals?${params.toString()}`);
      const result = await res.json();

      if (result.code !== 200) {
        throw new Error(result.message || '获取信号数据失败');
      }

      // 兼容 data 直接为数组或包一层 { signals/list/items, date }
      const payload = result.data;
      const list: unknown[] = Array.isArray(payload)
        ? payload
        : payload?.signals ?? payload?.list ?? payload?.items ?? [];
      if (!Array.isArray(payload) && payload?.date) {
        setActualDate(payload.date);
      } else {
        setActualDate('');
      }

      setSignals(
        list.map((item: any) => ({
          code: item.code,
          name: item.name,
          market: item.market,
          type: item.type,
          date: item.date,
          detail: parseDetail(item.detail) ?? { volumeRatio: 0, position: 0, changePct: 0, close: 0 },
        }))
      );
    } catch (e) {
      setError((e as Error).message);
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, [signalType, date]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  // 点击行：用信号数据合成 RealtimeStock，受控打开个股详情弹窗
  const openDetail = (signal: Signal) => {
    setDetailStock({
      code: signal.code,
      name: signal.name,
      market: signal.market,
      open: 0,
      close: signal.detail.close,
      current: signal.detail.close,
      high: 0,
      low: 0,
      volume: 0,
      amount: 0,
      changePct: signal.detail.changePct,
      pnlPct: 0,
      pnlAmount: 0,
      cost: 0,
      updatedAt: signal.date,
    });
    setDetailOpen(true);
  };

  const getMarketBadgeTone = (market: string): BadgeTone => {
    const tones: Record<string, BadgeTone> = {
      sh: 'blue',
      sz: 'success',
      bj: 'danger',
    };
    return tones[market] || 'neutral';
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-lg">
              📈
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">市场分析</h1>
              <p className="text-xs text-fg-3">A股放量信号</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" asChild className="hidden sm:flex">
              <Link href="/stock-pool/ashare">
                <Database className="w-4 h-4 mr-2" />
                A股总览
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/stock-pool">
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回股票池
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchSignals}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 筛选区：信号类型 Tab + 日期选择 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex rounded-lg border border-border overflow-hidden">
                {SignalTypeTabs.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setSignalType(t.value)}
                    className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                      signalType === t.value
                        ? 'bg-brand-blue text-white'
                        : 'bg-bg text-fg-3 hover:bg-surface-2'
                    }`}
                  >
                    {t.value === 'bottom_volume' ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-fg-3" />
                <Input
                  type="date"
                  value={date}
                  max={todayString()}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="w-[160px]"
                />
                {actualDate && actualDate !== date && (
                  <span className="text-xs text-fg-3">
                    实际信号日期: {actualDate}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 信号表格 */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[100px]">代码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead className="w-[80px]">市场</TableHead>
                  <TableHead className="text-right">收盘价</TableHead>
                  <TableHead className="text-right">当日涨跌幅</TableHead>
                  <TableHead className="text-right">量比</TableHead>
                  <TableHead className="text-right">位置分位</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.map((signal) => {
                  const isUp = signal.detail.changePct > 0;
                  return (
                    <TableRow
                      key={`${signal.market}-${signal.code}`}
                      className="cursor-pointer"
                      onClick={() => openDetail(signal)}
                    >
                      <TableCell className="font-mono font-medium">{signal.code}</TableCell>
                      <TableCell>{signal.name}</TableCell>
                      <TableCell>
                        <Badge tone={getMarketBadgeTone(signal.market)}>
                          {(signal.market || '').toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ¥{signal.detail.close.toFixed(2)}
                      </TableCell>
                      {/* A股惯例：红涨绿跌 */}
                      <TableCell className={`text-right font-mono ${isUp ? 'text-red-400' : 'text-green-400'}`}>
                        {isUp ? '+' : ''}{signal.detail.changePct.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {signal.detail.volumeRatio.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPosition(signal.detail.position)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && !error && signals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-fg-3">
                      该日期暂无{SignalTypeTabs.find(t => t.value === signalType)?.label}信号
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-fg-3">
                      加载中...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && error && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="text-yellow-400">⚠️ {error}</div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                        onClick={fetchSignals}
                      >
                        重试
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      {/* 个股详情弹窗 */}
      <StockDetailModal
        stock={detailStock}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
