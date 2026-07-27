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

export type TWallStcnLive = {
    article: null
    author: {
        avatar: string,
        display_name: string,
        id: number,
        is_followed: boolean,
        uri: string
    }
    channels: string[]
    comment_count: number
    content: string
    content_more: string
    content_text: string
    cover_images: string[]
    display_time: number
    fund_codes: string[]
    global_channel_name: string
    has_live_reading: boolean
    id: number
    images: string[]
    is_calendar: boolean
    is_favourite: boolean
    is_priced: boolean
    is_scaling: boolean
    reference: string
    related_themes: string[]
    score: number
    symbols: TSymbol[]
    tags: string[]
    title: string
    type: string,
    uri: string
}

export type TXuangubaoLive = {
    id: number
    title: string
    title_path: string
    summary: string
    summary_path: string
    image: string
    pc_image: string
    subscribe_type: number
    is_subscribed: boolean
    is_premium: boolean
    impact: number
    need_explained: boolean
    whether_hide_impact_face: boolean
    subj_ids: number[]
    stocks: TStockInfo[]
    watermarks: string
    has_summary: boolean
    created_at: number
    manual_updated_at: number
    content_refused: boolean
    flash_message_type: string
    super_vip_right_type: number
    all_stocks: TStockInfo[]
    sub_title: string
    route: string
}

export interface TStockInfo {
    name: string
    symbol: string
    market: string
}

export type TSymbol = {
    key: string
    name: string
}

export type TLivesMap = {
    [date: string]: number[]
}