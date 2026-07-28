'use client'

import { useState } from 'react';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StockDetailModal } from '@/components/stock-pool/stock-detail-modal';
import type { RealtimeStock } from '@/hooks/useRealtimeData';

/* 合并快讯流（全部来源，按发布时间倒序）。
   数据全部来自服务端 news_flash 表（定时任务采集+个股关联），不再前端直连第三方。
   SWR 15s 轮询第一页，「加载更多」分页追加。 */

interface NewsItem {
    id: number;
    source: string;
    title: string | null;
    content: string;
    codes: string | null;
    publishedAt: string;
}

interface NewsPage {
    list: NewsItem[];
    total: number;
    page: number;
    pageSize: number;
}

const PAGE_SIZE = 30;
const REFRESH_INTERVAL = 15000;

const SOURCE_LABELS: Record<string, string> = {
    wallstcn: '见闻',
    xuangubao: '选股宝',
};

const fetcher = async (url: string): Promise<NewsPage> => {
    const res = await fetch(url);
    const json = await res.json();
    if (json.code !== 200) throw new Error(json.message || '获取快讯失败');
    return json.data;
};

// 去掉快讯内容里的 HTML 标签，只保留纯文本
const stripHtml = (html: string): string =>
    html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

export default function NewsFeed() {
    const { data: firstPage } = useSWR<NewsPage>(
        `/api/ashare/news?page=1&pageSize=${PAGE_SIZE}`,
        fetcher,
        { refreshInterval: REFRESH_INTERVAL, revalidateOnFocus: false }
    );
    // 「加载更多」追加的第 2..n 页（第一页由 SWR 轮询保证最新）
    const [olderItems, setOlderItems] = useState<NewsItem[]>([]);
    const [nextPage, setNextPage] = useState(2);
    const [loadingMore, setLoadingMore] = useState(false);

    const [detailStock, setDetailStock] = useState<RealtimeStock | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    // 合并去重（第一页内容可能因轮询前移，与旧页有重叠）
    const seen = new Set<number>();
    const items: NewsItem[] = [];
    for (const item of [...(firstPage?.list ?? []), ...olderItems]) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
    }
    const total = firstPage?.total ?? 0;
    const hasMore = items.length < total;

    const loadMore = async () => {
        setLoadingMore(true);
        try {
            const page = await fetcher(`/api/ashare/news?page=${nextPage}&pageSize=${PAGE_SIZE}`);
            setOlderItems(prev => [...prev, ...page.list]);
            setNextPage(p => p + 1);
        } catch (e) {
            console.warn('[news-feed] loadMore failed:', e);
        } finally {
            setLoadingMore(false);
        }
    };

    // 点 codes 徽章 → 个股详情弹窗（名称未知时用代码占位，与 ashare 页一致）
    const openDetail = (code: string) => {
        setDetailStock({
            code,
            name: code,
            market: '',
            open: 0, close: 0, high: 0, low: 0,
            current: 0, volume: 0, amount: 0,
            changePct: 0, cost: 0, pnlPct: 0, pnlAmount: 0,
        });
        setDetailOpen(true);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 pt-4 pb-2 flex items-baseline gap-2 border-b border-border">
                <span className="text-sm font-semibold text-fg-1">资讯快讯</span>
                <span className="text-xs text-fg-3">共 {total} 条 · 15s 自动刷新</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2" style={{ maxHeight: 720 }}>
                {items.length === 0 && (
                    <div className="py-10 text-center text-sm text-fg-3">暂无快讯</div>
                )}
                {items.map(item => (
                    <div key={item.id} className="py-2.5 border-b border-border last:border-0">
                        <div className="flex items-center gap-2 text-xs text-fg-3">
                            <span className="font-mono">{dayjs(item.publishedAt).format('MM-DD HH:mm')}</span>
                            <Badge tone={item.source === 'wallstcn' ? 'orange' : 'blue'}>
                                {SOURCE_LABELS[item.source] ?? item.source}
                            </Badge>
                        </div>
                        {item.title && (
                            <div className="mt-1 text-[13px] font-medium text-fg-1">{item.title}</div>
                        )}
                        <div className="mt-0.5 text-[13px] leading-relaxed text-fg-2">
                            {stripHtml(item.content)}
                        </div>
                        {item.codes && (
                            <div className="mt-1 flex flex-wrap gap-1">
                                {item.codes.split(',').map(c => c.trim()).filter(Boolean).map(code => (
                                    <button key={code} onClick={() => openDetail(code)}>
                                        <Badge tone="neutral" className="cursor-pointer hover:bg-surface-sunken">
                                            {code}
                                        </Badge>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                {hasMore && (
                    <div className="py-3 text-center">
                        <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
                            {loadingMore ? '加载中…' : '加载更多'}
                        </Button>
                    </div>
                )}
            </div>

            <StockDetailModal stock={detailStock} open={detailOpen} onOpenChange={setDetailOpen} />
        </div>
    );
}
