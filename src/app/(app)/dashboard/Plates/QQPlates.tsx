"use client"

import useSWR from "swr"
import { TQQPlate } from "../type"
import http from "@/utils/http"
import Skeleton from "@/components/Skeleton"
import NumberFlow from '@number-flow/react'
import { NumberFlowFormat } from "@/utils/format"

export default function QQPlates() {
    // 腾讯板块排行无 CORS 头，改走服务端代理 /api/stocks/plates-qq
    const { data = { data: { rank_list: [] } } } = useSWR(
        '/api/stocks/plates-qq',
        http.getAll,
        {
            refreshInterval: 10000
        }
    )

    const getColor = (num: number) => {
        // 涨跌色随设置页「涨跌配色」翻转（--up/--down，默认红涨绿跌）
        if (num > 0) return "bg-up hover:brightness-110 bg-opacity-75"
        if (num == 0) return "bg-gray-600 hover:bg-gray-500 bg-opacity-75"
        return "bg-down hover:brightness-110 bg-opacity-75"
    }

    return (
        <div className="grid grid-cols-3 gap-1 w-full text-white">
            {
                data.data.rank_list.length === 0 ? [...Array.from(Array(9).keys())].map(i => <Skeleton key={i} className="w-full rounded-sm h-20" />) : data.data.rank_list.map((item: TQQPlate) => (
                    <div key={item.code} className={`rounded-sm cursor-pointer w-full flex flex-col gap-1 py-4 justify-center items-center ${getColor(parseFloat(item.zdf))}`}>
                        <span className="text-xs">{item.name}</span>
                        <NumberFlow value={parseFloat(item.zdf) / 100} format={NumberFlowFormat.rate} />
                    </div>
                ))
            }
        </div>
    )
}
