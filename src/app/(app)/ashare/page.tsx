'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { StockDetailModal } from '@/components/stock-pool/stock-detail-modal';
import { RealtimeStock } from '@/hooks/useRealtimeData';
import { toDisplayCode } from '@/utils/stock-code';
import {
  RefreshCw, Database, LineChart, TrendingUp, Newspaper,
  Search, ChevronLeft, ChevronRight, Zap
} from 'lucide-react';

// 与 /api/ashare/stats 返回结构一致
interface AshareStats {
  stocks: number;
  dailyDate: string | null;
  dailyCount: number;
  fullHistory: number;
  signals: { date: string | null; bottomVolume: number; topVolume: number };
  news: { total: number; matched: number; latest: string | null };
}

interface StockItem {
  code: string;
  name: string;
  market: string;
  marketCap: number | null;
  floatMarketCap: number | null;
  pe: number | null;
  current: number | null;
  changePct: number | null;
  volume: number | null; // 手
  turnover: number | null; // %
  amplitude: number | null; // %
  industryPlates: string[];
  conceptPlates: string[];
}

const PAGE_SIZE = 30;

// 成交量（手）→ 手 / 万手 / 亿手展示
const formatHands = (v?: number | null): string => {
  if (v == null || v <= 0) return '-';
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿手`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万手`;
  return `${Math.round(v)}手`;
};

// 市值（元）→ 亿 / 万展示
const formatCap = (v?: number | null): string => {
  if (v == null || v <= 0) return '-';
  return v >= 1e8 ? `${(v / 1e8).toFixed(2)}亿` : `${(v / 1e4).toFixed(2)}万`;
};

// 百分比展示
const formatPct = (v?: number | null): string => (v == null ? '-' : `${v.toFixed(2)}%`);

/* A股数据总览：统计卡 + 全市场股票清单（纯数据浏览）。
   同步操作在 /data「数据管理」，快讯流在 /news「资讯管理」。 */
export default function AshareOverviewPage() {
  const [stats, setStats] = useState<AshareStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  // 股票列表
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [stocksTotal, setStocksTotal] = useState(0);
  const [stocksPage, setStocksPage] = useState(1);
  const [stocksLoading, setStocksLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [market, setMarket] = useState('');

  // 个股详情弹窗
  const [detailStock, setDetailStock] = useState<RealtimeStock | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 统计卡片
  const fetchStats = useCallback(async () => {
    try {
      setStatsError(null);
      const res = await fetch('/api/ashare/stats');
      const result = await res.json();
      if (result.code !== 200) throw new Error(result.message || '获取统计失败');
      setStats(result.data);
    } catch (e) {
      setStatsError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // 搜索关键字防抖（300ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
      setStocksPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  // 股票列表
  const fetchStocks = useCallback(async () => {
    try {
      setStocksLoading(true);
      const params = new URLSearchParams({
        page: String(stocksPage),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedKeyword) params.set('keyword', debouncedKeyword);
      if (market) params.set('market', market);
      const res = await fetch(`/api/ashare/stocks?${params.toString()}`);
      const result = await res.json();
      if (result.code !== 200) throw new Error(result.message || '获取股票列表失败');
      setStocks(result.data.list);
      setStocksTotal(result.data.total);
    } catch (e) {
      console.error('获取股票列表失败:', e);
      setStocks([]);
      setStocksTotal(0);
    } finally {
      setStocksLoading(false);
    }
  }, [stocksPage, debouncedKeyword, market]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  // 用股票基础信息合成 RealtimeStock 打开详情弹窗（无实时行情字段置 0，参考 analysis 页做法）
  const openStockDetail = (stock: { code: string; name: string; market: string }) => {
    setDetailStock({
      code: stock.code,
      name: stock.name,
      market: stock.market,
      open: 0,
      close: 0,
      current: 0,
      high: 0,
      low: 0,
      volume: 0,
      amount: 0,
      changePct: 0,
      pnlPct: 0,
      pnlAmount: 0,
      cost: 0,
    });
    setDetailOpen(true);
  };

  const stocksTotalPages = Math.max(1, Math.ceil(stocksTotal / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-lg">
              🗂️
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">A股数据总览</h1>
              <p className="text-xs text-fg-3">行情 / 信号 / 快讯</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 统计卡片行 */}
        {statsError && (
          <div className="mb-4 text-sm text-yellow-400">⚠️ 统计数据加载失败：{statsError}</div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <Database className="w-4 h-4" />
                在市股票
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats ? stats.stocks : '-'}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <LineChart className="w-4 h-4" />
                最新日线
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.dailyDate ?? '-'}</div>
              <p className="text-xs text-fg-3 mt-1">
                {stats ? `${stats.dailyCount} 条` : ''}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                历史已满(≥250根)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats ? stats.fullHistory : '-'}</div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                最新信号
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {stats ? `${stats.signals.bottomVolume} / ${stats.signals.topVolume}` : '-'}
              </div>
              <p className="text-xs text-fg-3 mt-1">
                {stats?.signals.date ? `${stats.signals.date} 底部/顶部` : '暂无信号'}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-500/10 to-sky-500/10 border-cyan-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-normal text-fg-3 flex items-center gap-2">
                <Newspaper className="w-4 h-4" />
                快讯
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats ? stats.news.total : '-'}</div>
              <p className="text-xs text-fg-3 mt-1">
                {stats ? `已关联 ${stats.news.matched} 条` : ''}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 股票列表检索 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-3" />
                <Input
                  placeholder="搜索代码或名称..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Select value={market} onValueChange={(v) => { setMarket(v || ''); setStocksPage(1); }}>
                  <SelectTrigger className="w-[130px]" placeholder="市场" />
                  <SelectContent>
                    <SelectItem value="">全部</SelectItem>
                    <SelectItem value="sh">上证</SelectItem>
                    <SelectItem value="sz">深证</SelectItem>
                    <SelectItem value="bj">北交所</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="secondary" size="icon" onClick={fetchStocks}>
                  <RefreshCw className={`w-4 h-4 ${stocksLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 股票列表 */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>代码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead className="text-right">现价</TableHead>
                  <TableHead className="text-right">流通市值（总市值）</TableHead>
                  <TableHead className="text-right">成交量</TableHead>
                  <TableHead className="text-right">换手率</TableHead>
                  <TableHead className="text-right">市盈率</TableHead>
                  <TableHead className="text-right">振幅</TableHead>
                  <TableHead>行业板块</TableHead>
                  <TableHead>热门板块</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stocks.map((stock) => (
                  <TableRow
                    key={stock.code}
                    className="cursor-pointer"
                    onClick={() => openStockDetail(stock)}
                  >
                    <TableCell className="font-mono font-medium whitespace-nowrap">
                      {toDisplayCode(stock.code, stock.market)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{stock.name}</TableCell>
                    <TableCell className={`text-right font-mono whitespace-nowrap ${
                      (stock.changePct ?? 0) > 0 ? 'text-up' : (stock.changePct ?? 0) < 0 ? 'text-down' : ''
                    }`}>
                      {stock.current != null ? `¥${stock.current.toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {stock.floatMarketCap == null && stock.marketCap == null
                        ? '-'
                        : `${formatCap(stock.floatMarketCap)}（${formatCap(stock.marketCap)}）`}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {formatHands(stock.volume)}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {formatPct(stock.turnover)}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {stock.pe != null && stock.pe !== 0 ? stock.pe.toFixed(2) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {formatPct(stock.amplitude)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {stock.industryPlates.length > 0 ? stock.industryPlates.join('、') : '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm" title={stock.conceptPlates.join('、')}>
                      {stock.conceptPlates.length > 0
                        ? stock.conceptPlates.slice(0, 3).join('、') + (stock.conceptPlates.length > 3 ? ` 等${stock.conceptPlates.length}个` : '')
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
                {!stocksLoading && stocks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-fg-3">
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
                {stocksLoading && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-fg-3">
                      加载中...
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 股票列表分页 */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-fg-3">
            共 {stocksTotal} 只，第 {stocksPage} / {stocksTotalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={stocksPage <= 1 || stocksLoading}
              onClick={() => setStocksPage(p => p - 1)}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              上一页
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={stocksPage >= stocksTotalPages || stocksLoading}
              onClick={() => setStocksPage(p => p + 1)}
            >
              下一页
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
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
