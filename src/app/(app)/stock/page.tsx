import { TrendingDown, TrendingUp } from 'lucide-react';
import Indices from "./Indices";
import { XuangubaoLives, WallstcnLives } from "./Lives";
import { XuangubaoPlates, QQPlates } from "./Plates";

export const metadata = {
    title: '股市',
}

export default function StockPage() {
    return (
        <div className='w-full p-4 md:p-8 flex flex-col gap-4 md:gap-6'>
            <Indices />

            <div className="w-full flex flex-1 gap-4 md:gap-6">
                <div className="flex flex-1 flex-col bg-white rounded-2xl drop-shadow">
                    <WallstcnLives />
                </div>

                <div className="flex flex-1 flex-col bg-white rounded-2xl drop-shadow">
                    <XuangubaoLives />
                </div>

                <div className="w-96 flex flex-col gap-4">
                    <div className="bg-white rounded-2xl drop-shadow p-4">
                        <div className="mb-2">
                            行业板块
                            <TrendingUp className="inline w-4 h-4 text-red-500 ml-2" />
                        </div>
                        <QQPlates />
                    </div>

                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="mb-2">
                            板块涨幅榜
                            <TrendingUp className="inline w-4 h-4 text-red-500 ml-2" />
                        </div>
                        <XuangubaoPlates is_acs={true} limit={9} />
                    </div>

                    <div className="bg-white rounded-lg shadow p-4">
                        <div className="mb-2">
                            板块跌幅榜
                            <TrendingDown className="inline w-4 h-4 text-green-500 ml-2" />
                        </div>
                        <XuangubaoPlates is_acs={false} limit={9} />
                    </div>
                </div>
            </div>
        </div>
    )
};
