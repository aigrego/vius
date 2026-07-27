'use client'

import Link from 'next/link';
import useSWR from 'swr';
import http from '@/utils/http';
import { TRealData } from './type';
import NumberFlow from '@number-flow/react';
import { NumberFlowFormat, StockFormat } from '@/utils/format';
import { TStock } from '@/types/stock-pool/stock';

// 指数清单接口（原 @/service 的 STOCK_SERVICE.STOCKS，迁移时内联）
const STOCKS_API = '/api/stocks';

export default function Indices({ refreshInterval = 5000 }) {

    const { data: stocks = [] } = useSWR<TStock[]>(STOCKS_API, http.find_);
    // 指数实时快照走服务端 /api/stocks/real（wallstcn api-ddc 已下线，改为三源降级代理）
    const { isLoading, data: realResp } = useSWR<TRealData>(
        '/api/stocks/real',
        http.getAll,
        { refreshInterval }
    );

    if (isLoading || !realResp) {
        return (
            <div className="grid grid-cols-6 gap-4 w-full">
                {
                    [...Array.from(Array(6).keys())].map(i => <div key={i} className="rounded-lg w-full shadow h-28 bg-white" />)
                }
            </div>
        )
    }

    const getTextColor = (num: number) => {
        if (num > 0) return 'text-red-600'
        if (num == 0) return 'text-gray-600'
        return 'text-green-600'
    }

    return (
        <div className="grid grid-cols-8 gap-4 w-full text-white">
            {
                stocks.map(stock => {
                    if (Object.keys(realResp.data.snapshot).length > 0) {
                        const stockFullCode = `${stock.code}.${stock.source}`;
                        const stockInfo = realResp.data.snapshot[stockFullCode]
                        const stockObj = Object.fromEntries(realResp.data.fields.map((_, i) => [realResp.data.fields[i], stockInfo?.[i]]))
                        return (
                            <Link href={`/stock/${stockFullCode}`} key={stockObj['prod_code']}>
                                <div className={`cursor-pointer rounded-lg w-full flex flex-col shadow gap-1 py-4 justify-center items-center bg-white ${getTextColor(stockObj['px_change'] as number)}`}>
                                    <span className='text-sm'>{stockObj['prod_name']}</span>
                                    <NumberFlow className='text-3xl font-semibold' value={stockObj['last_px'] as number} format={NumberFlowFormat.value} />
                                    <div className='flex flex-row gap-2 text-sm'>
                                        <span>{StockFormat.trend(stockObj['px_change'] as number)}</span>
                                        <span>{StockFormat.rate(stockObj['px_change_rate'] as number / 100)}</span>
                                    </div>
                                </div>
                            </Link>
                        )
                    }
                })
            }
        </div>
    )
}
