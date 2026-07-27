'use client'

import InfiniteScrollLoader from "@/components/InfiniteScrollLoader"
import dayjs from "@/utils/dayjs"
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from "react"
import useInfiniteScroll from "react-infinite-scroll-hook"
import useSWR from "swr"
import http from "@/utils/http"
import sanitizeHtml from "@/utils/sanitizeHtml"
import { TXuangubaoLive, TLivesMap, TRealData, TStockInfo } from "../type"
import { StockFormat } from "@/utils/format"

function StocksTag({ stocks }: { stocks: TStockInfo[] }) {

    const fields = ["prod_code", "prod_name", "px_change", "px_change_rate", "price_precision", "delisting_date"]
    const { data: realResp = { data: { fields: [], snapshot: {} } } } = useSWR<TRealData>(`https://api-ddc.wallstcn.com/market/real?prod_code=${stocks.map(item => item.symbol).join(',')}&fields=${fields.join(',')}`, http.getAll, { refreshInterval: 15000, revalidateOnFocus: false })

    const render = (stock: Array<string | number>) => {
        const stockObj = Object.fromEntries(fields.map((_, i) => [fields[i], stock[i]]))
        const change = stockObj['px_change'] as number
        const state = {
            icon: change > 0 ? '▲' : change === 0 ? '' : '▼',
            rate: StockFormat.rate(stockObj['px_change_rate'] as number / 100),
            style: change > 0 ? 'text-red-600 border-red-600' : change === 0 ? 'text-gray-600 border-gray-600' : 'text-green-600 border-green-600',
        }
        return (
            <Link href={`/stock/${stockObj['prod_code']}`} key={stockObj['prod_code']}>
                <span className={`cursor-pointer flex flex-row rounded-sm border py-1 px-2 text-sm ${state.style}`}>
                    {state.icon} {stockObj['prod_name']}({stockObj['prod_code']}) {state.rate}
                </span>
            </Link>
        )
    }

    return (
        <div className="flex flex-row flex-wrap gap-2">
            {
                Object.values(realResp.data.snapshot).map(item => render(item))
            }
        </div>
    )

}

function Live({ live }: { live: TXuangubaoLive }) {

    const titleStyle = (ids: number[]) => ids.indexOf(10) > -1 ? "text-red-600" : ''
    const contentStyle = (ids: number[]) => ids.indexOf(10) > -1 ? "text-red-400" : ''

    return (
        <div key={live.id} className={`w-full flex flex-row py-4 border-b text-opacity-75`}>
            <div className="w-16 py-[2px]">{dayjs(live.manual_updated_at * 1000).format('HH:mm')}</div>
            <div className={`flex flex-col gap-2 w-full border-l border-dashed pl-5 py-[2px] ${titleStyle(live.subj_ids)}`}>
                {
                    live.title.length > 0 && <div className="font-medium">{live.title}</div>
                }
                {/* 第三方快讯 HTML，渲染前做白名单消毒防 XSS */}
                <article className={`${contentStyle(live.subj_ids)}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(live.summary) }} />
                {
                    live.all_stocks.length > 0 && <StocksTag stocks={live.all_stocks} />
                }
            </div>
        </div>
    )
}

export default function XuangubaoLives({ refreshInterval = 60000 }) {
    const [cursor, setCursor] = useState('');
    const [lives, setLives] = useState<TXuangubaoLive[]>([]);
    const [livesMap, setLivesMap] = useState<TLivesMap>({});
    const [isLoading, setIsLoading] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);

    const [sentryRef] = useInfiniteScroll({
        loading: isLoading,
        hasNextPage: true,
        onLoadMore: () => {
            http.getAll(`https://baoer-api.xuangubao.cn/api/v6/message/newsflash?limit=20&subj_ids=9,10,723,35,469,821&platform=pcweb&cursor=${cursor}`).then(resp => {
                const data = resp.data
                setLives(pre => [...pre, ...(data.messages)])
                setCursor(data.next_cursor)
            })
        }
    });

    const fetchLives = useCallback(async () => {
        setIsLoading(true)
        const resp = await http.getAll(`https://baoer-api.xuangubao.cn/api/v6/message/newsflash?limit=20&subj_ids=9,10,723,35,469,821&platform=pcweb`)
        const data = resp.data
        // 函数式更新，避免 useCallback([]) 闭包读取旧的 cursor/lives
        setCursor(pre => data.next_cursor > pre ? data.next_cursor : pre)
        setLives(pre => {
            if (pre.length === 0) return data.messages
            const index = data.messages.findIndex((item: TXuangubaoLive) => item.id === pre[0]?.id)
            if (index === 0) return pre
            if (index > 0) return [...(data.messages.subarray(0, index)), ...pre]
            return [...(data.messages), ...pre]
        })
        setIsLoading(false)
    }, []);

    useEffect(() => {
        const startRefresh = () => {
            fetchLives(); // 刷新第一页的数据
            timerRef.current = setTimeout(startRefresh, refreshInterval);
          };
          startRefresh();
          // 清除定时器以避免内存泄漏
          return () => clearTimeout(timerRef.current);
    }, [fetchLives]);

    useEffect(() => {
        if (lives.length > 0) {
            const tmp: TLivesMap = {}
            lives.forEach((item, index) => {
                const date = new Date(item.manual_updated_at * 1000).toLocaleDateString('zh-CN');
                if (date in tmp) {
                    tmp?.[date]?.push(index)
                } else {
                    tmp[date] = [index]
                }
            })
            setLivesMap(tmp)
        }
    }, [lives]);

    return (
        <div className="flex flex-col w-full px-8 py-4 text-sm gap-6">
            {
                Object.keys(livesMap).map((date) => {
                    const [_, month, day] = date.split('/');
                    return (
                        <div key={date}>
                            <div className="relative mb-10">
                                <span className="absolute bg-gray-800 font-medium px-4 py-2 text-gray-100 rounded-r-full -left-8">{month}月{day}日</span>
                            </div>
                            {
                                livesMap?.[date]?.map((liveIndex) => {
                                    const live = lives?.[liveIndex];
                                    if (live) {
                                      return <Live key={live.id} live={live} />;
                                    }
                                    return null;
                                })
                            }
                        </div>
                    )
                })
            }
            <InfiniteScrollLoader sentryRef={sentryRef} showLoading={true} />
        </div>
    )
}
