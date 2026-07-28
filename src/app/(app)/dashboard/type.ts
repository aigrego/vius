export type StockPlatesProps = {
    limit: number
    is_acs: boolean
}

export type TXuangubaoPlates = {
    code: number
    data: {
        [key: string]: TXuangubaoPlate
    }
}

export type TXuangubaoPlate = {
    core_avg_pcp: number
    core_avg_pcp_rank: number
    core_avg_pcp_rank_change: number
    fall_count: number
    fund_flow: number
    is_new: boolean | null
    limit_up_count: number
    plate_id: null
    plate_name: string
    rise_count: number
    stay_count: number
    top_n_stocks: {
        items: {
            change_percent: number
            price_change: number
            stock_chi_name: string
            symbol: string
        }[]
    }
}

export type TQQPlate = {
    code: string
    name: string
    zxj: string
    zdf: string
    zd: string
    hsl: string
    lb: string
    volume: string
    turnover: string
    zsz: string
    ltsz: string
    speed: string
    zdf_d5: string
    zdf_d20: string
    zdf_d60: string
    zdf_y: string
    zdf_w52: string
    zllr: string
    zllc: string
    zljlr: string
    zljlr_d5: string
    zljlr_d20: string
    zgb: string
    lzg: {
        code: string
        name: string
        zxj: string
        zdf: string
        zd: string
    }
    stock_type: string
}


export type TRealData = {
    code: number
    data: {
        fields: string[]
        snapshot: {
            [key: string]: Array<string | number>
        }
    }

}
