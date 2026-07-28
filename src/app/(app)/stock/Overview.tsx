'use client'

import { useEffect, useState } from 'react';
import Link from 'next/link';
import NumberFlow from '@number-flow/react';
import { NumberFlowFormat, StockFormat } from '@/utils/format';
import { Badge } from '@/components/ui/badge';
import { StockDetailModal } from '@/components/stock-pool/stock-detail-modal';
import type { RealtimeStock } from '@/hooks/useRealtimeData';

/* 行情总览三排卡片：指数 / 持仓股 / 股票池。
   数据流：挂载先读 /api/stocks/overview 缓存立即渲染 → 随后 ?refresh=1 重算更新
   → 之后每 10s 自调度轮询 refresh（卸载清理定时器）。 */

interface IndexCard {
    code: string;            // 全代码，如 000001.SS
    name: string;
    last_px: number;
    px_change: number;
    px_change_rate: number;  // 百分数，如 1.23 表示 +1.23%
}

interface PositionCard {
    code: string;
    name: string;
    market: string;
    totalQty: number;
    avgCost: number;
    current: number;
    change: number;
    changePct: number;
    pnl: number | null;      // 无行情时为 null，显示 '-'
}

interface WatchCard {
    code: string;
    name: string;
    market: string;
    current: number;
    change: number;
    changePct: number;
    sincePct: number;        // 关注后涨跌幅（百分数）
    newsCount: number;       // 近 7 天关联资讯数
}

interface OverviewData {
    indices: IndexCard[] | null;
    positions: PositionCard[] | null;
    watchlist: WatchCard[] | null;
    updatedAt: Partial<Record<'indices' | 'positions' | 'watchlist', string>>;
}

// 涨跌颜色：涨 text-up / 跌 text-down / 平盘灰（token 由 globals.css 提供）
const trendColor = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-gray-600');

const REFRESH_INTERVAL = 10000;

export default function Overview() {
    const [data, setData] = useState<OverviewData | null>(null);
    // 首次 refresh 未返回且无任何缓存时显示骨架
    const [refreshed, setRefreshed] = useState(false);
    const [detailStock, setDetailStock] = useState<RealtimeStock | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;

        const load = async (url: string) => {
            try {
                const resp = await fetch(url);
                if (!resp.ok) return;
                const json = await resp.json();
                if (!cancelled && json.code === 200 && json.data) {
                    setData(json.data);
                }
            } catch (e) {
                console.warn('[overview] fetch failed:', e);
            }
        };

        // 自调度轮询：上一次 refresh 完成后再安排下一次，避免请求叠加
        const tick = async () => {
            await load('/api/stocks/overview?refresh=1');
            if (cancelled) return;
            setRefreshed(true);
            timer = setTimeout(tick, REFRESH_INTERVAL);
        };

        // 先读缓存立即渲染，随后启动 refresh 轮询
        load('/api/stocks/overview').then(() => {
            if (!cancelled) tick();
        });

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, []);

    // 点击持仓/股票池卡片 → 个股详情弹窗（RealtimeStock 缺省字段补 0）
    const openDetail = (stock: RealtimeStock) => {
        setDetailStock(stock);
        setDetailOpen(true);
    };

    const positionToDetail = (c: PositionCard): RealtimeStock => ({
        code: c.code,
        name: c.name,
        market: c.market,
        open: 0, close: 0, high: 0, low: 0,
        current: c.current,
        volume: 0, amount: 0,
        changePct: c.changePct,
        cost: c.avgCost,
        pnlPct: c.pnl !== null && c.avgCost > 0 ? (c.pnl / (c.avgCost * c.totalQty)) * 100 : 0,
        pnlAmount: c.pnl ?? 0,
    });

    const watchToDetail = (c: WatchCard): RealtimeStock => ({
        code: c.code,
        name: c.name,
        market: c.market,
        open: 0, close: 0, high: 0, low: 0,
        current: c.current,
        volume: 0, amount: 0,
        changePct: c.changePct,
        cost: 0,
        pnlPct: c.sincePct,
        pnlAmount: 0,
    });

    // 骨架：无任何缓存且首次 refresh 未回（Tailwind 类名必须静态写出，不做动态拼接）
    if (!data && !refreshed) {
        const skeletonCard = (i: number) => (
            <div key={i} className="rounded-lg w-full shadow h-28 bg-surface animate-pulse" />
        );
        return (
            <div className="flex flex-col gap-4 w-full">
                <div className="grid grid-cols-8 gap-4 w-full">{Array.from({ length: 8 }).map((_, i) => skeletonCard(i))}</div>
                <div className="grid grid-cols-6 gap-4 w-full">{Array.from({ length: 6 }).map((_, i) => skeletonCard(i))}</div>
                <div className="grid grid-cols-6 gap-4 w-full">{Array.from({ length: 6 }).map((_, i) => skeletonCard(i))}</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 md:gap-6 w-full">
            {/* 排 1：指数（沿用原 Indices 卡片样式，数据源换 overview 缓存） */}
            <section>
                <div className="text-sm text-fg-3 mb-2">指数</div>
                <div className="grid grid-cols-8 gap-4 w-full">
                    {(data?.indices ?? []).map(idx => (
                        <Link href={`/stock/${idx.code}`} key={idx.code}>
                            <div className={`cursor-pointer rounded-lg w-full flex flex-col shadow gap-1 py-4 justify-center items-center bg-surface ${trendColor(idx.px_change)}`}>
                                <span className="text-sm">{idx.name}</span>
                                <NumberFlow className="text-2xl font-semibold whitespace-nowrap" value={idx.last_px} format={NumberFlowFormat.value} />
                                <div className="flex flex-row gap-2 text-sm">
                                    <span>{StockFormat.trend(idx.px_change)}</span>
                                    <span>{StockFormat.rate(idx.px_change_rate / 100)}</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* 排 2：持仓股 */}
            <section>
                <div className="text-sm text-fg-3 mb-2">持仓股</div>
                {data?.positions && data.positions.length > 0 ? (
                    <div className="grid grid-cols-6 gap-4 w-full">
                        {data.positions.map(p => (
                            <div
                                key={p.code}
                                onClick={() => openDetail(positionToDetail(p))}
                                className="cursor-pointer rounded-lg w-full flex flex-col shadow gap-1 py-3 px-3 justify-center items-center bg-surface"
                            >
                                <div className="flex flex-row items-baseline gap-2">
                                    <span className="text-sm">{p.name}</span>
                                    <span className="text-xs font-mono text-fg-3">{p.code}</span>
                                </div>
                                <div className={`flex flex-row gap-2 text-sm ${trendColor(p.change)}`}>
                                    <span>{StockFormat.trend(p.change)}</span>
                                    <span>{StockFormat.rate(p.changePct / 100)}</span>
                                </div>
                                <div className="flex flex-row gap-3 text-xs text-fg-3">
                                    <span>成本 {p.avgCost.toFixed(3)}</span>
                                    <span className={p.pnl === null ? '' : trendColor(p.pnl)}>
                                        盈亏 {p.pnl === null ? '-' : StockFormat.trend(p.pnl)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-lg w-full shadow bg-surface py-6 text-center text-sm text-fg-3">暂无持仓</div>
                )}
            </section>

            {/* 排 3：股票池 */}
            <section>
                <div className="text-sm text-fg-3 mb-2">股票池</div>
                {data?.watchlist && data.watchlist.length > 0 ? (
                    <div className="grid grid-cols-6 gap-4 w-full">
                        {data.watchlist.map(w => (
                            <div
                                key={w.code}
                                onClick={() => openDetail(watchToDetail(w))}
                                className="cursor-pointer rounded-lg w-full flex flex-col shadow gap-1 py-3 px-3 justify-center items-center bg-surface"
                            >
                                <div className="flex flex-row items-baseline gap-2">
                                    <span className="text-sm">{w.name}</span>
                                    <span className="text-xs font-mono text-fg-3">{w.code}</span>
                                </div>
                                <div className={`flex flex-row gap-2 text-sm ${trendColor(w.change)}`}>
                                    <span>{StockFormat.trend(w.change)}</span>
                                    <span>{StockFormat.rate(w.changePct / 100)}</span>
                                </div>
                                <div className="flex flex-row items-center gap-2 text-xs text-fg-3">
                                    <span className={trendColor(w.sincePct)}>
                                        关注后 {StockFormat.rate(w.sincePct / 100)}
                                    </span>
                                    {w.newsCount > 0 && <Badge tone="blue">资讯 {w.newsCount}</Badge>}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-lg w-full shadow bg-surface py-6 text-center text-sm text-fg-3">股票池为空</div>
                )}
            </section>

            {/* 个股详情弹窗 */}
            <StockDetailModal
                stock={detailStock}
                open={detailOpen}
                onOpenChange={setDetailOpen}
            />
        </div>
    );
}
