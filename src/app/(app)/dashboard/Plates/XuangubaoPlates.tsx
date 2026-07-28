'use client'

import useSWR from 'swr'
import Skeleton from '@/components/Skeleton'
import http from '@/utils/http'
import { StockPlatesProps, TXuangubaoPlate } from '../type'

/* 选股宝板块涨/跌幅榜（is_acs=true 涨幅榜）。
   数据读服务端 plate_cache（/api/stocks/plates，定时任务预热，已在服务端排序取前 N），
   不再前端直连 flash-api。 */
export default function XuangubaoPlates({ limit, is_acs }: StockPlatesProps) {

    const { data = { data: [] } } = useSWR<{ data: TXuangubaoPlate[] }>(
        `/api/stocks/plates?kind=${is_acs ? 'xgb_rise' : 'xgb_fall'}`,
        http.getAll,
        { refreshInterval: 10000 }
    )

    const getColor = (num: number) => {
        // 涨跌色随设置页「涨跌配色」翻转（--up/--down，默认红涨绿跌）
        if (num > 0) return 'bg-up hover:brightness-110'
        if (num == 0) return 'bg-gray-500 hover:bg-gray-400'
        return 'bg-down hover:brightness-110'
    }

    const format = (num: number) => {
        if (num > 0) return `+${num.toFixed(2)}`
        return num.toFixed(2)
    }

    const plates = data.data.slice(0, limit)

    return (
        <div className="grid grid-cols-3 gap-1 w-full text-white">
            {
                plates.length === 0 ? [...Array.from(Array(limit).keys())].map(i => <Skeleton key={i} className="w-full rounded-sm h-20" />) : plates.map((item) => (
                    <div key={item.plate_id} className={`rounded-sm cursor-pointer w-full flex flex-col gap-1 py-4 justify-center items-center ${getColor(item.core_avg_pcp)}`}>
                        <span className='text-xs'>{item.plate_name}</span>
                        <span className=''>{format(item.core_avg_pcp * 100)}%</span>
                    </div>
                ))
            }
        </div>
    )

};
