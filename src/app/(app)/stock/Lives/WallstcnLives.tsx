'use client'

import dayjs from "@/utils/dayjs"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import InfiniteScroll from "react-infinite-scroll-component"
import useSWR from "swr"
import { Loading } from "@/components/Icons"
import http from "@/utils/http"
import sanitizeHtml from "@/utils/sanitizeHtml"
import { TWallStcnLive, TLivesMap, TRealData, TSymbol } from "../type"

function StocksTag({ symbols }: { symbols: TSymbol[] }) {

    const fields = ["prod_code", "prod_name", "px_change", "px_change_rate", "price_precision", "delisting_date"]
    const { data: realResp = { data: { fields: [], snapshot: {} } } } = useSWR<TRealData>(`https://api-ddc.wallstcn.com/market/real?prod_code=${symbols.map(item => item.key).join(',')}&fields=${fields.join(',')}`, http.getAll, { refreshInterval: 15000, revalidateOnFocus: false })

    const render = (stock: Array<string | number>) => {
        const stockObj = Object.fromEntries(fields.map((_, i) => [fields[i], stock[i]]))
        let state = {
            icon: '',
            rate: '0.00',
            style: 'text-gray-600 border-gray-600'
        }
        if (stockObj['px_change'] as number > 0) {
            state = {
                icon: '▲',
                rate: '+' + (stockObj['px_change_rate'] as number).toFixed(2),
                style: 'text-red-600 border-red-600'
            }
        } else if (stockObj['px_change'] as number < 0) {
            state = {
                icon: '▼',
                rate: (stockObj['px_change_rate'] as number).toFixed(2),
                style: 'text-green-600 border-green-600'
            }
        }
        return (
            <Link href={`/stock/${stockObj['prod_code']}`} key={stockObj['prod_code']}>
                <span className={`cursor-pointer flex flex-row rounded-sm border py-1 px-2 text-sm ${state.style}`}>
                    {state.icon} {stockObj['prod_name']}({stockObj['prod_code']}) {state.rate}%
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

function Live({ live }: { live: TWallStcnLive }) {

    const contentStyle = (score: number) => score > 1 ? "text-red-600" : ''

    return (
        <div key={live.id} className={`w-full flex flex-row py-4 border-b ${contentStyle(live.score)}`}>
            <div className="w-16 py-[2px]">{dayjs(live.display_time * 1000).format('HH:mm')}</div>
            <div className='flex flex-col gap-2 w-full border-l border-dashed pl-5 py-[2px]'>
                {
                    live.title.length > 0 && <div className="font-medium">【{live.title}】</div>
                }
                {/* 第三方快讯 HTML，渲染前做白名单消毒防 XSS */}
                <article className="" dangerouslySetInnerHTML={{ __html: sanitizeHtml(live.content) }} />
                {
                    live.symbols.length > 0 && <StocksTag symbols={live.symbols} />
                }
            </div>
        </div>
    )
}


export default function WallstcnLives({ refreshInterval = 60000 }) {
    const [cursor, setCursor] = useState('');
    const [lives, setLives] = useState<TWallStcnLive[]>([]);
    const [livesMap, setLivesMap] = useState<TLivesMap>({});
    // 根据接口返回的 next_cursor 判断是否还有更多数据
    const [hasMore, setHasMore] = useState(true);
    const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);

    const fetchMore = () => {
        http.getAll(`https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&client=pc&limit=20&accept=live&first_page=false&cursor=${cursor}`).then(resp => {
            const data = resp.data
            setLives(pre => [...pre, ...(data.items)])
            setCursor(data.next_cursor)
            setHasMore(!!data.next_cursor)
        })
    };

    const fetchLives = useCallback(async () => {
        const resp = await http.getAll(`https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&client=pc&limit=20&accept=live&first_page=true`)
        const data = resp.data
        // 函数式更新，避免 useCallback([]) 闭包读取旧的 cursor/lives
        setCursor(pre => data.next_cursor > pre ? data.next_cursor : pre)
        setLives(pre => {
            if (pre.length === 0) return data.items
            const index = data.items.findIndex((item: TWallStcnLive) => item.id === pre[0]?.id)
            if (index === 0) return pre
            if (index > 0) return [...(data.items.subarray(0, index)), ...pre]
            return [...(data.items), ...pre]
        })
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
            let tmp: TLivesMap = {}
            lives.forEach((item, index) => {
                const date = new Date(item.display_time * 1000).toLocaleDateString('zh-CN')
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
        <InfiniteScroll
            className="flex flex-col w-full px-8 py-4 text-sm gap-6"
            dataLength={lives.length}
            next={fetchMore}
            hasMore={hasMore}
            loader={<div className="my-8 mx-auto col-span-full"><Loading className='h-20 w-20' /></div>}
        >
            {
                Object.keys(livesMap).map((date) => {
                    const [_, month, day] = date.split('/')
                    return (
                        <div key={date}>
                            <div className="relative mb-10">
                                <span className="absolute bg-gray-800 font-medium px-4 py-2 text-gray-100 rounded-r-full -left-8">{month}月{day}日</span>
                            </div>
                            {
                                livesMap?.[date]?.map((liveIndex) => lives[liveIndex] != undefined && <Live key={(lives[liveIndex] as TWallStcnLive).id} live={lives[liveIndex] as TWallStcnLive} />)
                            }
                        </div>
                    )
                })
            }
        </InfiniteScroll>
    )
}
