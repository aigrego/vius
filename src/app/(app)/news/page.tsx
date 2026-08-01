'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StockDetailModal } from '@/components/stock-pool/stock-detail-modal';
import { RealtimeStock } from '@/hooks/useRealtimeData';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface NewsItem {
  id: number;
  source: string;
  title: string | null;
  content: string;
  codes: string | null;
  publishedAt: string;
}

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

/* 资讯管理：分页查询全库快讯（news_flash，含各数据源），支持只看已关联个股。
   数据源启停配置在设置页「资讯管理」tab（admin）。 */
export default function NewsManagePage() {
  // 快讯列表
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsTotal, setNewsTotal] = useState(0);
  const [newsPage, setNewsPage] = useState(1);
  const [newsLoading, setNewsLoading] = useState(false);
  const [onlyMatched, setOnlyMatched] = useState(false);

  // 个股详情弹窗
  const [detailStock, setDetailStock] = useState<RealtimeStock | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 快讯列表
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
    fetchNews();
  }, [fetchNews]);

  // 用股票基础信息合成 RealtimeStock 打开详情弹窗（无实时行情字段置 0）
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

  // 点击快讯里的 code badge：先查股票基础信息拿到名称/市场，再打开详情弹窗
  const openNewsCodeDetail = async (code: string) => {
    try {
      const res = await fetch(`/api/ashare/stocks?keyword=${code}&pageSize=10`);
      const result = await res.json();
      const hit = (result.data?.list as { code: string; name: string; market: string }[] | undefined)
        ?.find(s => s.code === code);
      openStockDetail(hit ?? { code, name: code, market: '' });
    } catch {
      openStockDetail({ code, name: code, market: '' });
    }
  };

  const newsTotalPages = Math.max(1, Math.ceil(newsTotal / NEWS_PAGE_SIZE));

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-surface/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-sky-500 flex items-center justify-center text-lg">
              📰
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">资讯管理</h1>
              <p className="text-xs text-fg-3">全库快讯分页查询</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
