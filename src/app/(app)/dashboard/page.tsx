import { TrendingDown, TrendingUp } from 'lucide-react';
import Overview from "./Overview";
import NewsFeed from "./NewsFeed";
import AshareRank from "./AshareRank";
import { XuangubaoPlates, QQPlates } from "./Plates";

export const metadata = { title: '股市' }

/* 行情总览：三排卡片（指数/持仓/股票池，后两排有数据才显示）+
   三列区块：左=A股总览涨幅排行（查库）/ 中=合并快讯流（查库）/ 右=板块（行业+涨跌幅榜） */
export default function StockPage() {
    return (
        <div className='w-full p-4 md:p-8 flex flex-col gap-4 md:gap-6'>
            <Overview />

            <div className="w-full flex flex-1 gap-4 md:gap-6">
                <div className="flex flex-1 flex-col bg-surface rounded-2xl shadow">
                    <AshareRank />
                </div>

                <div className="flex flex-1 flex-col bg-surface rounded-2xl shadow">
                    <NewsFeed />
                </div>

                <div className="w-96 flex flex-col gap-4">
                    <div className="bg-surface rounded-2xl shadow p-4">
                        <div className="mb-2 text-fg-1">
                            行业板块
                            <TrendingUp className="inline w-4 h-4 text-up ml-2" />
                        </div>
                        <QQPlates />
                    </div>

                    <div className="bg-surface rounded-2xl shadow p-4">
                        <div className="mb-2 text-fg-1">
                            板块涨幅榜
                            <TrendingUp className="inline w-4 h-4 text-up ml-2" />
                        </div>
                        <XuangubaoPlates is_acs={true} limit={9} />
                    </div>

                    <div className="bg-surface rounded-2xl shadow p-4">
                        <div className="mb-2 text-fg-1">
                            板块跌幅榜
                            <TrendingDown className="inline w-4 h-4 text-down ml-2" />
                        </div>
                        <XuangubaoPlates is_acs={false} limit={9} />
                    </div>
                </div>
            </div>
        </div>
    )
};
