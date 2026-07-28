'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RealtimeStock } from '@/hooks/useRealtimeData';
import { StockChart } from '@/components/stock-pool/stock-chart';
import { StockChips } from '@/components/stock-pool/stock-chips';
import { StockNews } from '@/components/stock-pool/stock-news';
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Clock, Layers, Newspaper } from 'lucide-react';

interface StockDetailModalProps {
  stock: RealtimeStock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DetailTab = 'kline' | 'chips' | 'news';

/* 打开时按 code 补拉实时行情（/api/stocks/real）合并进展示数据：
   从快讯/排行/龙虎榜等入口打开时调用方只传了基础信息（行情字段为 0），
   由弹窗自己补齐当前价/今开/昨收/最高/最低等；cost/pnl 仍以调用方传入为准 */
const REAL_FIELDS = [
  'prod_name', 'last_px', 'px_change_rate', 'open_px', 'preclose_px',
  'high_px', 'low_px', 'turnover_volume', 'turnover_value'
];

// market 为空时按代码前缀推断完整代码（6→SS，0/3→SZ，4/8/920→BJ）
const toFullCode = (code: string, market?: string): string => {
  if (code.includes('.')) return code;
  const suffix = market === 'sh' ? 'SS'
    : market === 'sz' ? 'SZ'
    : market === 'bj' ? 'BJ'
    : code.startsWith('6') ? 'SS'
    : (code.startsWith('4') || code.startsWith('8') || code.startsWith('920')) ? 'BJ'
    : 'SZ';
  return `${code}.${suffix}`;
};

const realFetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json();
  return json.code === 200 ? json.data : null;
};

export function StockDetailModal({ stock, open, onOpenChange }: StockDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>('kline');
  // 记录已激活过的 Tab，数据在首次激活时才请求，之后保持挂载避免重复请求
  const [visited, setVisited] = useState<Set<DetailTab>>(new Set(['kline']));

  const fullCode = stock ? toFullCode(stock.code, stock.market) : '';
  const { data: snapshot } = useSWR(
    open && stock ? `/api/stocks/real?prod_code=${fullCode}&fields=${REAL_FIELDS.join(',')}` : null,
    realFetcher,
    { refreshInterval: 15000, revalidateOnFocus: false }
  );

  const handleTabChange = (value: string) => {
    const next = value as DetailTab;
    setTab(next);
    setVisited(prev => prev.has(next) ? prev : new Set(prev).add(next));
  };

  if (!stock) return null;

  // 合并实时行情（snapshot 行为 fields 顺序取值）
  const row = snapshot?.snapshot?.[fullCode];
  const quote: Partial<RealtimeStock> = row
    ? {
        current: Number(row[1]) || stock.current,
        changePct: Number(row[2]) || 0,
        open: Number(row[3]) || 0,
        close: Number(row[4]) || 0,
        high: Number(row[5]) || 0,
        low: Number(row[6]) || 0,
        volume: Number(row[7]) || 0,
        amount: Number(row[8]) || 0,
        updatedAt: new Date().toISOString()
      }
    : {};
  const merged: RealtimeStock = { ...stock, ...quote };
  // 名称占位（调用方未知时用代码占位）时用行情里的名称替换
  if (row && (!merged.name || merged.name === merged.code)) {
    merged.name = String(row[0] || merged.name);
  }

  const isProfit = merged.pnlPct > 0;
  const isUp = merged.changePct > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        {/* vius 的 Dialog 无 DialogHeader/DialogTitle，用普通 div 代替 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-mono font-semibold">{merged.code}</div>
            <p className="text-fg-3">{merged.name}</p>
          </div>
          <div className="flex gap-2">
            <Badge tone="neutral" className="text-lg px-3 py-1">
              {(merged.market || 'unknown').toUpperCase()}
            </Badge>
            <Badge
              tone={isUp ? 'success' : 'danger'}
              className="text-lg px-3 py-1"
            >
              {isUp ? '+' : ''}{merged.changePct}%
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <Card className="bg-bg border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-fg-3 font-normal">当前价格</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-mono font-bold ${isUp ? 'text-up' : 'text-down'}`}>
                ¥{merged.current?.toFixed(2) || '-'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-bg border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-fg-3 font-normal">持仓成本</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-mono font-bold text-yellow-400">
                {/* cost 是 Prisma Decimal，序列化后为字符串，先转 Number */}
                ¥{merged.cost ? Number(merged.cost).toFixed(3) : '-'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-bg border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-fg-3 font-normal">盈亏比例</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              {isProfit ? (
                <>
                  <TrendingUp className="w-5 h-5 text-up" />
                  <div className="text-2xl font-mono font-bold text-up">
                    +{merged.pnlPct}%
                  </div>
                </>
              ) : (
                <>
                  <TrendingDown className="w-5 h-5 text-down" />
                  <div className="text-2xl font-mono font-bold text-down">
                    {merged.pnlPct}%
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-bg border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-fg-3 font-normal">盈亏金额</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-mono font-bold ${isProfit ? 'text-up' : 'text-down'}`}>
                {isProfit ? '+' : ''}¥{merged.pnlAmount?.toFixed(2) || '0.00'}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="flex items-center gap-2 text-sm">
            <BarChart3 className="w-4 h-4 text-fg-3" />
            <span className="text-fg-3">今开:</span>
            <span className="font-mono">¥{merged.open?.toFixed(2)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-fg-3" />
            <span className="text-fg-3">昨收:</span>
            <span className="font-mono">¥{merged.close?.toFixed(2)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4 text-up" />
            <span className="text-fg-3">最高:</span>
            <span className="font-mono text-up">¥{merged.high?.toFixed(2)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <TrendingDown className="w-4 h-4 text-down" />
            <span className="text-fg-3">最低:</span>
            <span className="font-mono text-down">¥{merged.low?.toFixed(2)}</span>
          </div>
        </div>

        {merged.volume > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-fg-3">
              <Clock className="w-4 h-4" />
              <span>最后更新: {merged.updatedAt ? new Date(merged.updatedAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
          </div>
        )}

        {/* K线 / 筹码分布 / 相关资讯 */}
        <div className="mt-6">
          <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="kline" className="gap-1">
                <BarChart3 className="w-4 h-4" /> K线走势
              </TabsTrigger>
              <TabsTrigger value="chips" className="gap-1">
                <Layers className="w-4 h-4" /> 筹码分布
              </TabsTrigger>
              <TabsTrigger value="news" className="gap-1">
                <Newspaper className="w-4 h-4" /> 相关资讯
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className={tab === 'kline' ? '' : 'hidden'}>
            <StockChart
              code={merged.code}
              market={merged.market || 'sh'}
              name={merged.name}
            />
          </div>
          {visited.has('chips') && (
            <div className={tab === 'chips' ? '' : 'hidden'}>
              <StockChips
                code={merged.code}
                market={merged.market || 'sh'}
                currentPrice={merged.current}
              />
            </div>
          )}
          {visited.has('news') && (
            <div className={tab === 'news' ? '' : 'hidden'}>
              <StockNews
                code={merged.code}
                market={merged.market || 'sh'}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
