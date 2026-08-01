'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import Skeleton from '@/components/Skeleton'
import { StockDetailModal } from '@/components/stock-pool/stock-detail-modal'
import type { RealtimeStock } from '@/hooks/useRealtimeData'

/* 板块成分股弹层：打开时请求 /api/stocks/plates/[code]/stocks（code 需 URL 编码，
   如 xgb:886001 → xgb%3A886001）。壳层不滚动，成分股列表独立纵向滚动；
   行点击打开个股详情弹窗（StockDetailModal）。 */

interface PlateInfo {
    code: string
    name: string
    kind: string
    source: string
}

interface PlateStockItem {
    stockCode: string // fullCode，如 SH600519
    code: string      // 裸 6 位代码
    name: string
    market: string    // 小写 sh/sz/bj/hk
    current: number | null // 现价（无当日行情行为 null）
    changePct: number | null
}

interface PlateStocksData {
    plate: PlateInfo
    list: PlateStockItem[]
    updatedAt: string
}

export interface PlateStocksModalProps {
    plateCode: string | null // xgb:<plate_id> / qq:<腾讯板块code>
    open: boolean
    onOpenChange: (open: boolean) => void
}

const fetcher = async (url: string): Promise<PlateStocksData> => {
    const res = await fetch(url)
    const json = await res.json()
    if (json.code !== 200) throw new Error(json.message || '获取板块成分股失败')
    return json.data
}

export default function PlateStocksModal({ plateCode, open, onOpenChange }: PlateStocksModalProps) {
    const { data, error, isLoading } = useSWR<PlateStocksData>(
        open && plateCode ? `/api/stocks/plates/${encodeURIComponent(plateCode)}/stocks` : null,
        fetcher,
        { revalidateOnFocus: false }
    )

    const [detailStock, setDetailStock] = useState<RealtimeStock | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)

    // 行点击 → 个股详情弹窗（行情字段置 0，由弹窗自己按 code 补拉实时行情）
    const openDetail = (item: PlateStockItem) => {
        setDetailStock({
            code: item.code,
            name: item.name,
            market: item.market,
            open: 0, close: 0, high: 0, low: 0,
            current: 0, volume: 0, amount: 0,
            changePct: 0, cost: 0, pnlPct: 0, pnlAmount: 0,
        })
        setDetailOpen(true)
    }

    const list = data?.list ?? []

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* 壳层 overflow-hidden 不滚动，列表块独立纵向滚动 */}
            <DialogContent className="bg-surface border-border w-[min(560px,92vw)] max-h-[80vh] overflow-hidden p-5 flex flex-col">
                <div className="flex items-baseline justify-between flex-none">
                    <div className="text-lg font-semibold text-fg-1">
                        {data?.plate.name ?? '板块成分股'}
                        {data?.plate.code && (
                            <span className="ml-2 text-xs font-mono text-fg-3">{data.plate.code}</span>
                        )}
                    </div>
                    {data && (
                        <span className="text-xs text-fg-3">
                            {list.length} 只{data.updatedAt ? ` · ${new Date(data.updatedAt).toLocaleString('zh-CN')}` : ''}
                        </span>
                    )}
                </div>

                <div className="mt-3 flex items-center px-2 py-1.5 text-xs text-fg-3 border-b border-border flex-none">
                    <span className="w-20">代码</span>
                    <span className="flex-1">名称</span>
                    <span className="w-20 text-right">现价</span>
                    <span className="w-20 text-right">涨跌幅</span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {isLoading && (
                        <div className="flex flex-col gap-1 py-1">
                            {[...Array.from(Array(8).keys())].map(i => <Skeleton key={i} className="w-full h-8 rounded-sm" />)}
                        </div>
                    )}
                    {!isLoading && error && (
                        <div className="py-10 text-center text-sm text-fg-3">
                            {error.message === 'Not Found' || /404/.test(error.message) ? '板块未入库' : `加载失败：${error.message}`}
                        </div>
                    )}
                    {!isLoading && !error && list.length === 0 && (
                        <div className="py-10 text-center text-sm text-fg-3">暂无成分股数据</div>
                    )}
                    {!isLoading && !error && list.map(item => {
                        const pct = item.changePct
                        const pctCls = pct == null ? 'text-fg-3' : pct > 0 ? 'text-up' : pct < 0 ? 'text-down' : 'text-fg-2'
                        return (
                            <div
                                key={item.stockCode}
                                onClick={() => openDetail(item)}
                                className="cursor-pointer flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-2"
                            >
                                <span className="w-20 font-mono text-sm text-fg-2">{item.code}</span>
                                <span className="flex-1 text-sm text-fg-1 truncate">{item.name}</span>
                                <span className="w-20 text-right font-mono text-sm text-fg-2">
                                    {item.current == null ? '-' : item.current.toFixed(2)}
                                </span>
                                <span className={`w-20 text-right font-mono text-sm ${pctCls}`}>
                                    {pct == null ? '-' : `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </DialogContent>

            <StockDetailModal stock={detailStock} open={detailOpen} onOpenChange={setDetailOpen} />
        </Dialog>
    )
}
