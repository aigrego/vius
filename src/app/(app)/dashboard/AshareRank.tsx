'use client'

import { useState } from 'react';
import useSWR from 'swr';
import { StockDetailModal } from '@/components/stock-pool/stock-detail-modal';
import type { RealtimeStock } from '@/hooks/useRealtimeData';

/* A股总览：当日涨跌幅排行（最新日线日期的 changePct 降序前 50）。
   数据来自服务端 stock_daily（收盘同步），60s 轮询。 */

interface RankItem {
    code: string;
    name: string;
    market: string;
    close: number;
    changePct: number;
}

interface RankData {
    date: string | null;
    list: RankItem[];
}

const fetcher = async (url: string): Promise<RankData> => {
    const res = await fetch(url);
    const json = await res.json();
    if (json.code !== 200) throw new Error(json.message || '获取排行失败');
    return json.data;
};

// 涨跌颜色：涨 text-up / 跌 text-down / 平盘灰
const trendColor = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-gray-600');

export default function AshareRank() {
    const { data } = useSWR<RankData>('/api/ashare/rank?limit=50', fetcher, {
        refreshInterval: 60000,
        revalidateOnFocus: false,
    });

    const [detailStock, setDetailStock] = useState<RealtimeStock | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const openDetail = (item: RankItem) => {
        setDetailStock({
            code: item.code,
            name: item.name,
            market: item.market,
            open: 0, close: item.close, high: 0, low: 0,
            current: item.close, volume: 0, amount: 0,
            changePct: item.changePct, cost: 0, pnlPct: 0, pnlAmount: 0,
        });
        setDetailOpen(true);
    };

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 pt-4 pb-2 flex items-baseline gap-2 border-b border-border">
                <span className="text-sm font-semibold text-fg-1">A股总览 · 涨幅排行</span>
                {data?.date && <span className="text-xs text-fg-3">{data.date}</span>}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1">
                {(!data || data.list.length === 0) && (
                    <div className="py-10 text-center text-sm text-fg-3">暂无数据</div>
                )}
                {data?.list.map((item, i) => (
                    <div
                        key={item.code}
                        onClick={() => openDetail(item)}
                        className="cursor-pointer flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-2"
                    >
                        <span className={`w-5 text-right text-xs font-mono ${i < 3 ? 'text-up font-semibold' : 'text-fg-3'}`}>
                            {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-fg-1 truncate">{item.name}</div>
                            <div className="text-[11px] font-mono text-fg-3">{item.code}</div>
                        </div>
                        <span className="text-[13px] font-mono text-fg-2">{item.close.toFixed(2)}</span>
                        <span className={`w-16 text-right text-[13px] font-mono font-medium ${trendColor(item.changePct)}`}>
                            {item.changePct > 0 ? '+' : ''}{item.changePct.toFixed(2)}%
                        </span>
                    </div>
                ))}
            </div>

            <StockDetailModal stock={detailStock} open={detailOpen} onOpenChange={setDetailOpen} />
        </div>
    );
}
