'use client';

import { useCallback, useEffect, useState, ComponentProps } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import {
  ArrowLeft, RefreshCw, Database, LineChart, TrendingUp, Newspaper,
  Search, ChevronLeft, ChevronRight, DownloadCloud, Zap, Rss
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
}

interface NewsItem {
  id: number;
  source: string;
  title: string | null;
  content: string;
  codes: string | null;
  publishedAt: string;
}

type TabKey = 'stocks' | 'news';
type SyncType = 'daily' | 'signals' | 'news';

const PAGE_SIZE = 30;
const NEWS_PAGE_SIZE = 30;

// 去掉快讯内容里的 HTML 标签，只保留纯文本摘要
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// 快讯来源显示名
const SOURCE_LABELS: Record<string, string> = {
  wallstcn: '见闻',
  xuangubao: '选股宝',
};

type BadgeTone = ComponentProps<typeof Badge>['tone'];

export default function AshareOverviewPage() {
  const [stats, setStats] = useState<AshareStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  // 手动同步
  const [syncing, setSyncing] = useState<SyncType | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Tab 切换（快讯 Tab 首次激活才请求）
  const [tab, setTab] = useState<TabKey>('stocks');
  const [newsVisited, setNewsVisited] = useState(false);

  // 股票列表
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [stocksTotal, setStocksTotal] = useState(0);
  const [stocksPage, setStocksPage] = useState(1);
  const [stocksLoading, setStocksLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [market, setMarket] = useState('');

  // 快讯列表
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsTotal, setNewsTotal] = useState(0);
  const [newsPage, setNewsPage] = useState(1);
  const [newsLoading, setNewsLoading] = useState(false);
  const [onlyMatched, setOnlyMatched] = useState(false);

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
    if (tab === 'stocks') fetchStocks();
  }, [tab, fetchStocks]);

  // 快讯列表（首次激活 Tab 才请求）
  const fetchNews = useCallback(async () => {
    try {
      setNewsLoading(true);
      const params = new URLSearchParams({
        page: String(newsPage),
        pageSize: String(NEWS_PAGE_SIZE),
      });
      if (onlyMatched) params.set('onlyMatched', '1');
      const res = await fetch(`/api/ashare/news?${params.toString()}`);
      const result = await res.json();
      if (result.code !== 200) throw new Error(result.message || '获取快讯失败');
      setNews(result.data.list);
      setNewsTotal(result.data.total);
    } catch (e) {
      console.error('获取快讯失败:', e);
      setNews([]);
      setNewsTotal(0);
    } finally {
      setNewsLoading(false);
    }
  }, [newsPage, onlyMatched]);

  useEffect(() => {
    if (tab === 'news') {
      setNewsVisited(true);
      fetchNews();
    }
  }, [tab, fetchNews]);

  // 手动同步（浏览器 session 鉴权，401 提示登录）
  const runSync = async (type: SyncType) => {
    try {
      setSyncing(type);
      setSyncMessage(null);
      const res = await fetch(`/api/ashare/sync?type=${type}`, { method: 'POST' });
      const result = await res.json().catch(() => null);
      if (res.status === 401) {
        setSyncMessage('请先登录后再执行同步');
        return;
      }
      if (!res.ok || !result || result.code !== 200) {
        throw new Error(result?.message || '同步失败');
      }
      const d = result.data || {};
      if (type === 'daily' && d.daily) {
        setSyncMessage(`同步完成：清单 ${d.daily.stocks} 只，日线 ${d.daily.dailies} 条，回补 ${d.daily.backfilled} 只`);
      } else if (type === 'signals' && d.signals) {
        setSyncMessage(`信号计算完成：检查 ${d.signals.checked} 只，触发 ${d.signals.signaled} 只`);
      } else if (type === 'news' && d.news) {
        setSyncMessage(`快讯抓取完成：获取 ${d.news.fetched} 条，新增 ${d.news.inserted} 条`);
      } else {
        setSyncMessage('同步完成');
      }
      // 同步完成后刷新统计卡片
      fetchStats();
    } catch (e) {
      setSyncMessage(`同步失败：${(e as Error).message}`);
    } finally {
      setSyncing(null);
    }
  };

  // 用股票基础信息合成 RealtimeStock 打开详情弹窗（无实时行情字段置 0，参考 analysis 页做法）
  const openStockDetail = (stock: StockItem) => {
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

  // 点击快讯里的 code badge：先查股票基础信息拿到名称/市场，再打开详情弹窗
  const openNewsCodeDetail = async (code: string) => {
    try {
      const res = await fetch(`/api/ashare/stocks?keyword=${code}&pageSize=10`);
      const result = await res.json();
      const hit = (result.data?.list as StockItem[] | undefined)?.find(s => s.code === code);
      openStockDetail(hit ?? { code, name: code, market: '' });
    } catch {
      openStockDetail({ code, name: code, market: '' });
    }
  };

  const getMarketBadgeTone = (m: string): BadgeTone => {
    const tones: Record<string, BadgeTone> = {
      sh: 'blue',
      sz: 'success',
      bj: 'danger',
    };
    return tones[m] || 'neutral';
  };

  const stocksTotalPages = Math.max(1, Math.ceil(stocksTotal / PAGE_SIZE));
  const newsTotalPages = Math.max(1, Math.ceil(newsTotal / NEWS_PAGE_SIZE));

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

          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" asChild className="hidden sm:flex">
              <Link href="/analysis">
                <LineChart className="w-4 h-4 mr-2" />
                市场分析
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/pool">
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回股票池
              </Link>
            </Button>
            <Button variant="secondary" size="sm" onClick={fetchStats}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
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

        {/* 手动同步 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => runSync('daily')}
                  disabled={syncing !== null}
                >
                  <DownloadCloud className={`w-4 h-4 mr-2 ${syncing === 'daily' ? 'animate-bounce' : ''}`} />
                  {syncing === 'daily' ? '同步中...' : '同步行情'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => runSync('signals')}
                  disabled={syncing !== null}
                >
                  <Zap className={`w-4 h-4 mr-2 ${syncing === 'signals' ? 'animate-pulse' : ''}`} />
                  {syncing === 'signals' ? '计算中...' : '计算信号'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => runSync('news')}
                  disabled={syncing !== null}
                >
                  <Rss className={`w-4 h-4 mr-2 ${syncing === 'news' ? 'animate-pulse' : ''}`} />
                  {syncing === 'news' ? '抓取中...' : '抓取快讯'}
                </Button>
              </div>
              <p className="text-xs text-fg-3">
                「同步行情」只跑清单+快照+新股回补，全量历史回补由后台每日自动进行（需登录）。
              </p>
            </div>
            {syncMessage && (
              <div className="mt-3 text-sm text-fg-3 border border-border rounded-lg px-3 py-2 bg-bg">
                {syncMessage}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tab 切换：股票列表 / 最新快讯 */}
        <div className="flex rounded-lg border border-border overflow-hidden w-fit mb-6">
          <button
            onClick={() => setTab('stocks')}
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === 'stocks'
                ? 'bg-brand-blue text-white'
                : 'bg-bg text-fg-3 hover:bg-surface-2'
            }`}
          >
            <Database className="w-4 h-4" />
            股票列表
          </button>
          <button
            onClick={() => setTab('news')}
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === 'news'
                ? 'bg-brand-blue text-white'
                : 'bg-bg text-fg-3 hover:bg-surface-2'
            }`}
          >
            <Newspaper className="w-4 h-4" />
            最新快讯
          </button>
        </div>

        {/* 股票列表 Tab */}
        {tab === 'stocks' && (
          <>
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

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[120px]">代码</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead className="w-[100px]">市场</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stocks.map((stock) => (
                      <TableRow
                        key={stock.code}
                        className="cursor-pointer"
                        onClick={() => openStockDetail(stock)}
                      >
                        <TableCell className="font-mono font-medium">{stock.code}</TableCell>
                        <TableCell>{stock.name}</TableCell>
                        <TableCell>
                          <Badge tone={getMarketBadgeTone(stock.market)}>
                            {(stock.market || '').toUpperCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!stocksLoading && stocks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-fg-3">
                          暂无数据
                        </TableCell>
                      </TableRow>
                    )}
                    {stocksLoading && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-fg-3">
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
          </>
        )}

        {/* 最新快讯 Tab（首次激活才请求） */}
        {tab === 'news' && newsVisited && (
          <>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => { setOnlyMatched(v => !v); setNewsPage(1); }}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  onlyMatched
                    ? 'bg-brand-blue text-white border-brand-blue'
                    : 'bg-bg text-fg-3 border-border hover:bg-surface-2'
                }`}
              >
                只看已关联
              </button>
              <Button variant="secondary" size="icon" onClick={fetchNews}>
                <RefreshCw className={`w-4 h-4 ${newsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="space-y-3">
              {news.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge tone="blue">
                        {SOURCE_LABELS[item.source] ?? item.source}
                      </Badge>
                      <span className="text-xs text-fg-3">
                        {new Date(item.publishedAt).toLocaleString('zh-CN')}
                      </span>
                      {(item.codes ?? '').split(',').filter(Boolean).map((code) => (
                        <Badge
                          key={code}
                          tone="blue"
                          className="cursor-pointer font-mono"
                          onClick={() => openNewsCodeDetail(code)}
                        >
                          {code}
                        </Badge>
                      ))}
                    </div>
                    {item.title && (
                      <div className="text-sm font-medium mb-1">{stripHtml(item.title)}</div>
                    )}
                    <p className="text-sm text-fg-3 line-clamp-2">
                      {stripHtml(item.content)}
                    </p>
                  </CardContent>
                </Card>
              ))}
              {!newsLoading && news.length === 0 && (
                <div className="text-center py-8 text-fg-3">暂无快讯</div>
              )}
              {newsLoading && (
                <div className="text-center py-8 text-fg-3">加载中...</div>
              )}
            </div>

            {/* 快讯分页 */}
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-fg-3">
                共 {newsTotal} 条，第 {newsPage} / {newsTotalPages} 页
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={newsPage <= 1 || newsLoading}
                  onClick={() => setNewsPage(p => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={newsPage >= newsTotalPages || newsLoading}
                  onClick={() => setNewsPage(p => p + 1)}
                >
                  下一页
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
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
