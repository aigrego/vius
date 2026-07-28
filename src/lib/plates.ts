// 板块行情采集：腾讯行业/题材板块（proxy.finance.qq.com）、选股宝板块涨/跌幅榜（flash-api）
// 由 sync-plates 定时任务周期调用写 plate_cache；API 冷启动时也可直接调用

const PLATE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* ---------- 腾讯行业/题材板块 ---------- */

// boardType: hy=行业板块 gn=题材(概念)板块；响应原样缓存（{code:0, data:{rank_list:[...]}}）
export const fetchQqPlates = async (boardType: 'hy' | 'gn'): Promise<any> => {
  const url = `https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type=${boardType}&sort_type=priceRatio&direct=down&offset=0&count=40`;
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Referer: 'https://stockapp.finance.qq.com', 'User-Agent': PLATE_UA }
  });
  if (!resp.ok) throw new Error(`qq plates HTTP ${resp.status}`);
  return resp.json();
};

/* ---------- 选股宝板块涨/跌幅榜 ---------- */

const XGB_DATA_FIELDS = [
  'plate_id',
  'plate_name',
  'fund_flow',
  'rise_count',
  'fall_count',
  'stay_count',
  'limit_up_count',
  'core_avg_pcp',
  'core_avg_pcp_rank',
  'core_avg_pcp_rank_change',
  'top_n_stocks',
  'is_new'
];

const xgbGet = async (url: string): Promise<any> => {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': PLATE_UA }
  });
  if (!resp.ok) throw new Error(`xuangubao HTTP ${resp.status}`);
  return resp.json();
};

// 涨/跌幅榜：先取板块 id 排行，再取明细，整形成按 core_avg_pcp 排序的数组（asc=涨幅榜降序，否则跌幅榜升序）
export const fetchXgbPlates = async (asc: boolean, limit = 9): Promise<any[]> => {
  const rank = await xgbGet('https://flash-api.xuangubao.cn/api/plate/rank?field=core_avg_pcp&type=0');
  const ids: number[] = rank?.data ?? [];
  if (ids.length === 0) throw new Error('xuangubao rank empty');
  const picked = asc ? ids.slice(0, limit) : ids.slice(-limit);
  const detail = await xgbGet(
    `https://flash-api.xuangubao.cn/api/plate/data?plates=${picked.join(',')}&fields=${XGB_DATA_FIELDS.join(',')}`
  );
  const plates = Object.values(detail?.data ?? {}) as { core_avg_pcp: number }[];
  return plates.sort((a, b) => (asc ? b.core_avg_pcp - a.core_avg_pcp : a.core_avg_pcp - b.core_avg_pcp));
};
