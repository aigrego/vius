'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import { StockDetailModal } from '@/components/stock-pool/stock-detail-modal';
import { RealtimeStock } from '@/hooks/useRealtimeData';
import { ImportDialog } from '@/app/(app)/analysis/ImportDialog';
import { toDisplayCode } from '@/utils/stock-code';
import { RefreshCw, CalendarDays, Upload } from 'lucide-react';

// 页面只展示底部放量信号（顶部放量已从页面移除；数据层/API 的 type 契约不变）
const SIGNAL_TYPE = 'bottom_volume';

// detail 字段与外部导入 CSV 对齐（自动计算的信号同样落这些字段，存量老数据可能缺）
interface SignalDetail {
  volumeRatio: number; // 放量倍数
  position: number | null; // 位置分位（列表不展示；导入行为 null）
  changePct: number; // 涨跌幅%
  close: number; // 收盘价
  drawdown?: number | null; // 回撤%（相对近一年最高价，负值）
  yearHigh?: number | null; // 近一年最高价
  highDate?: string | null; // 高点日期
  dayVolume?: number | null; // 当日量（万股）
  avgVolume20?: number | null; // 20 日均量（万股）
}

interface Signal {
  code: string;
  name: string;
  market: string;
  type: string;
  date: string;
  detail: SignalDetail;
}

// detail 字段后端约定为已 parse 的对象，这里兜底兼容字符串；各字段空值归一
function parseDetail(detail: unknown): SignalDetail {
  let raw: Partial<SignalDetail> | null = null;
  if (detail && typeof detail === 'string') {
    try {
      raw = JSON.parse(detail) as Partial<SignalDetail>;
    } catch {
      raw = null;
    }
  } else if (detail) {
    raw = detail as Partial<SignalDetail>;
  }
  return {
    volumeRatio: raw?.volumeRatio ?? 0,
    position: raw?.position ?? null,
    changePct: raw?.changePct ?? 0,
    close: raw?.close ?? 0,
    drawdown: raw?.drawdown ?? null,
    yearHigh: raw?.yearHigh ?? null,
    highDate: raw?.highDate ?? null,
    dayVolume: raw?.dayVolume ?? null,
    avgVolume20: raw?.avgVolume20 ?? null,
  };
}

// 万股展示（一位小数；无数据 '-'）
const formatWan = (v?: number | null): string => (v == null ? '-' : v.toFixed(1));

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function StockPoolAnalysisPage() {
  const [date, setDate] = useState<string>(todayString());
  const [signals, setSignals] = useState<Signal[]>([]);
  const [actualDate, setActualDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailStock, setDetailStock] = useState<RealtimeStock | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const fetchSignals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ type: SIGNAL_TYPE, date, limit: '100' });
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
          detail: parseDetail(item.detail),
        }))
      );
    } catch (e) {
      setError((e as Error).message);
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  // 导入成功：切到导入日期刷新（同日期时状态不变化，手动补一次刷新）
  const handleImported = (d: string) => {
    if (d === date) {
      fetchSignals();
    } else {
      setDate(d);
    }
  };

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
            {/* 时间筛选（无信号的日期会自动落到最近信号日，右侧提示实际日期） */}
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-fg-3" />
              <Input
                type="date"
                value={date}
                max={todayString()}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="w-[160px] h-8 text-xs"
              />
              {actualDate && actualDate !== date && (
                <span className="text-xs text-fg-3">
                  实际信号日期: {actualDate}
                </span>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              导入信号
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
        {/* 信号表格（列与外部导入 CSV 字段对齐 + 信号时间列，便于按放量天数汇总分析） */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>代码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead className="text-right">收盘价</TableHead>
                  <TableHead className="text-right">涨跌幅%</TableHead>
                  <TableHead className="text-right">近一年最高价</TableHead>
                  <TableHead>高点日期</TableHead>
                  <TableHead className="text-right">回撤%</TableHead>
                  <TableHead className="text-right">放量倍数</TableHead>
                  <TableHead className="text-right">当日量（万股）</TableHead>
                  <TableHead className="text-right">20日均量（万股）</TableHead>
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
                      <TableCell className="font-mono font-medium whitespace-nowrap">
                        {toDisplayCode(signal.code, signal.market)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{signal.name}</TableCell>
                      <TableCell className="font-mono whitespace-nowrap text-fg-3">
                        {signal.date?.slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        ¥{signal.detail.close.toFixed(2)}
                      </TableCell>
                      {/* 涨跌色随设置页「涨跌配色」翻转（--up/--down，默认红涨绿跌） */}
                      <TableCell className={`text-right font-mono whitespace-nowrap ${isUp ? 'text-up' : 'text-down'}`}>
                        {isUp ? '+' : ''}{signal.detail.changePct.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {signal.detail.yearHigh != null ? `¥${signal.detail.yearHigh.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="font-mono whitespace-nowrap text-fg-3">
                        {signal.detail.highDate ?? '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {signal.detail.drawdown != null ? `${signal.detail.drawdown.toFixed(1)}%` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {signal.detail.volumeRatio.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {formatWan(signal.detail.dayVolume)}
                      </TableCell>
                      <TableCell className="text-right font-mono whitespace-nowrap">
                        {formatWan(signal.detail.avgVolume20)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && !error && signals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-fg-3">
                      该日期暂无底部放量信号
                    </TableCell>
                  </TableRow>
                )}
                {loading && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-fg-3">
                      加载中...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && error && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8">
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

      {/* 放量信号导入弹窗 */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleImported}
      />
    </div>
  );
}
