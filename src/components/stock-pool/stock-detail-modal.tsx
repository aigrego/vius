'use client';

import { useState } from 'react';
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

export function StockDetailModal({ stock, open, onOpenChange }: StockDetailModalProps) {
  const [tab, setTab] = useState<DetailTab>('kline');
  // 记录已激活过的 Tab，数据在首次激活时才请求，之后保持挂载避免重复请求
  const [visited, setVisited] = useState<Set<DetailTab>>(new Set(['kline']));

  const handleTabChange = (value: string) => {
    const next = value as DetailTab;
    setTab(next);
    setVisited(prev => prev.has(next) ? prev : new Set(prev).add(next));
  };

  if (!stock) return null;

  const isProfit = stock.pnlPct > 0;
  const isUp = stock.changePct > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface border-border max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        {/* vius 的 Dialog 无 DialogHeader/DialogTitle，用普通 div 代替 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-mono font-semibold">{stock.code}</div>
            <p className="text-fg-3">{stock.name}</p>
          </div>
          <div className="flex gap-2">
            <Badge tone="neutral" className="text-lg px-3 py-1">
              {(stock.market || 'unknown').toUpperCase()}
            </Badge>
            <Badge
              tone={isUp ? 'success' : 'danger'}
              className="text-lg px-3 py-1"
            >
              {isUp ? '+' : ''}{stock.changePct}%
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <Card className="bg-bg border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-fg-3 font-normal">当前价格</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-mono font-bold ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                ¥{stock.current?.toFixed(2) || '-'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-bg border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-fg-3 font-normal">持仓成本</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-mono font-bold text-yellow-400">
                ¥{stock.cost?.toFixed(3) || '-'}
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
                  <TrendingUp className="w-5 h-5 text-green-400" />
                  <div className="text-2xl font-mono font-bold text-green-400">
                    +{stock.pnlPct}%
                  </div>
                </>
              ) : (
                <>
                  <TrendingDown className="w-5 h-5 text-red-400" />
                  <div className="text-2xl font-mono font-bold text-red-400">
                    {stock.pnlPct}%
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
              <div className={`text-2xl font-mono font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                {isProfit ? '+' : ''}¥{stock.pnlAmount?.toFixed(2) || '0.00'}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="flex items-center gap-2 text-sm">
            <BarChart3 className="w-4 h-4 text-fg-3" />
            <span className="text-fg-3">今开:</span>
            <span className="font-mono">¥{stock.open?.toFixed(2)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-fg-3" />
            <span className="text-fg-3">昨收:</span>
            <span className="font-mono">¥{stock.close?.toFixed(2)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <span className="text-fg-3">最高:</span>
            <span className="font-mono text-green-400">¥{stock.high?.toFixed(2)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <span className="text-fg-3">最低:</span>
            <span className="font-mono text-red-400">¥{stock.low?.toFixed(2)}</span>
          </div>
        </div>

        {stock.volume > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-fg-3">
              <Clock className="w-4 h-4" />
              <span>最后更新: {stock.updatedAt ? new Date(stock.updatedAt).toLocaleString('zh-CN') : '-'}</span>
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
              code={stock.code}
              market={stock.market || 'sh'}
              name={stock.name}
            />
          </div>
          {visited.has('chips') && (
            <div className={tab === 'chips' ? '' : 'hidden'}>
              <StockChips
                code={stock.code}
                market={stock.market || 'sh'}
                currentPrice={stock.current}
              />
            </div>
          )}
          {visited.has('news') && (
            <div className={tab === 'news' ? '' : 'hidden'}>
              <StockNews
                code={stock.code}
                market={stock.market || 'sh'}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
