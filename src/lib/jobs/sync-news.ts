// 资讯快讯抓取 + 个股关联任务
// 数据源由 news_source 表驱动（key 标识解析器），scheduler 的 sync-news 任务每 15 秒轮询启用源；
// 抓取的同时提取股票关键词（代码字面 > 名称匹配）判定与个股的相关度，连同 codes 一起落库

import { getStockBasicMap } from '@/model/StockBasic';
import { createNewsFlashes, TNewsFlashInput } from '@/model/NewsFlash';
import { listEnabledNewsSources, createNewsSource, markNewsSourceSync } from '@/model/NewsSource';

const NEWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 内置默认接口地址（news_source.url 缺省时使用）
const DEFAULT_URLS: Record<string, string> = {
  wallstcn: 'https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=50',
  xuangubao: 'https://baoer-api.xuangubao.cn/api/v6/message/newsflash?subj_ids=9,10,723,35,469,821&limit=50'
};

// 内置默认解析器参数（news_source.params 缺省时使用）
const DEFAULT_PARAMS: Record<string, string> = {
  xuangubao: '9,10,723,35,469,821' // subj_ids
};

interface RawNewsItem {
  source: string;
  externalId: string;
  title: string | null;
  content: string;
  publishedAt: Date;
}

// 抓取华尔街见闻快讯（防御性解析：响应结构以实际为准，字段缺失直接跳过）
async function fetchWallstcnNews(url: string): Promise<RawNewsItem[]> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': NEWS_UA }
  });
  if (!response.ok) throw new Error(`wallstcn HTTP ${response.status}`);
  const json = await response.json();
  const items = json?.data?.items;
  if (!Array.isArray(items)) return [];

  const result: RawNewsItem[] = [];
  for (const item of items) {
    const id = item?.id;
    const content = item?.content_text ?? item?.content;
    const displayTime = item?.display_time;
    if (id == null || typeof content !== 'string' || !content) continue;
    const ts = Number(displayTime);
    result.push({
      source: 'wallstcn',
      externalId: String(id),
      title: null,
      content,
      publishedAt: Number.isFinite(ts) ? new Date(ts * 1000) : new Date()
    });
  }
  return result;
}

// 抓取选股宝快讯；params 为 subj_ids（覆盖 url 里的缺省值时用）
async function fetchXuangubaoNews(url: string, params?: string | null): Promise<RawNewsItem[]> {
  let finalUrl = url;
  if (params) {
    const u = new URL(url);
    u.searchParams.set('subj_ids', params);
    finalUrl = u.toString();
  }
  const response = await fetch(finalUrl, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': NEWS_UA }
  });
  if (!response.ok) throw new Error(`xuangubao HTTP ${response.status}`);
  const json = await response.json();
  // 响应结构防御性兜底：data.messages / data.items / data 数组均可
  const data = json?.data;
  const items = Array.isArray(data) ? data : (data?.messages ?? data?.items);
  if (!Array.isArray(items)) return [];

  const result: RawNewsItem[] = [];
  for (const item of items) {
    const id = item?.id;
    const title = typeof item?.title === 'string' ? item.title : null;
    const summary = typeof item?.summary === 'string' ? item.summary : null;
    const content = summary ?? title;
    if (id == null || !content) continue;
    const ts = Number(item?.created_at);
    result.push({
      source: 'xuangubao',
      externalId: String(id),
      title,
      content,
      publishedAt: Number.isFinite(ts) ? new Date(ts * 1000) : new Date()
    });
  }
  return result;
}

// key → 解析器分派
const FETCHERS: Record<string, (url: string, params?: string | null) => Promise<RawNewsItem[]>> = {
  wallstcn: url => fetchWallstcnNews(url),
  xuangubao: (url, params) => fetchXuangubaoNews(url, params)
};

// 名称清洗：去掉 ST/*ST 前缀（ST 股在新闻中通常不带前缀）
const cleanStockName = (name: string): string =>
  name.replace(/^\*?ST/i, '').trim();

// 文本匹配股票：①6 位代码字面命中（相关度最高）②清洗后名称包含匹配
// 跳过：清洗后名称长度 <2（单字误配率高）、退市整理股（名称含「退」，如「文化退」，会误配宏观新闻）
// 返回 {code, keyword} 列表（keyword 为命中的代码或名称，留痕相关度判定依据）
export function matchStocks(
  text: string,
  nameMap: Map<string, string>,
  codeSet: Set<string>
): { code: string; keyword: string }[] {
  if (!text) return [];
  const matched = new Map<string, string>(); // code → keyword
  // 代码字面匹配
  for (const m of text.matchAll(/\b\d{6}\b/g)) {
    const code = m[0];
    if (codeSet.has(code) && !matched.has(code)) matched.set(code, code);
  }
  // 名称匹配
  for (const [name, code] of nameMap) {
    if (matched.has(code) || name.includes('退')) continue;
    const cleaned = cleanStockName(name);
    if (cleaned.length < 2) continue;
    if (text.includes(cleaned)) {
      matched.set(code, cleaned);
    }
  }
  return [...matched.entries()].map(([code, keyword]) => ({ code, keyword }));
}

// 首次运行时库里没有任何数据源，自动补默认的见闻/选股宝两个源
const ensureDefaultSources = async (): Promise<void> => {
  await createNewsSource({
    key: 'wallstcn',
    name: '华尔街见闻',
    url: DEFAULT_URLS.wallstcn,
    description: '华尔街见闻全球快讯',
    enabled: true
  });
  await createNewsSource({
    key: 'xuangubao',
    name: '选股宝',
    url: DEFAULT_URLS.xuangubao,
    params: DEFAULT_PARAMS.xuangubao,
    description: '选股宝 A股快讯',
    enabled: true
  });
};

// 15s 调度下的进程内防重入：上一轮未跑完则跳过本轮
let running = false;

// 抓取所有启用源 → 对每条计算关联股票与关键词 → 落库去重
export const syncNews = async (): Promise<{ fetched: number; inserted: number }> => {
  if (running) {
    console.log('[sync-news] 上一轮未结束，跳过本轮');
    return { fetched: 0, inserted: 0 };
  }
  running = true;
  try {
    let sources = await listEnabledNewsSources();
    if (sources.length === 0) {
      await ensureDefaultSources();
      sources = await listEnabledNewsSources();
    }

    // code → {name, market} 反转为 name → code；codeSet 供代码字面匹配校验
    const basicMap = await getStockBasicMap();
    const nameMap = new Map<string, string>();
    const codeSet = new Set<string>();
    for (const [code, basic] of basicMap) {
      nameMap.set(basic.name, code);
      codeSet.add(code);
    }

    let fetched = 0;
    let inserted = 0;
    // 逐源串行抓取（源数量少，串行更稳）；单源失败记 failed，不影响其他源
    for (const source of sources) {
      const fetcher = FETCHERS[source.key];
      if (!fetcher) {
        console.warn(`[sync-news] 未知解析器 key=${source.key}，跳过「${source.name}」`);
        continue;
      }
      try {
        const url = source.url || DEFAULT_URLS[source.key];
        const params = source.params || DEFAULT_PARAMS[source.key] || null;
        const raw = await fetcher(url, params);
        fetched += raw.length;

        const items: TNewsFlashInput[] = raw.map(item => {
          const text = `${item.title ?? ''} ${item.content}`;
          const matches = matchStocks(text, nameMap, codeSet);
          return {
            ...item,
            codes: matches.length > 0 ? matches.map(m => m.code).join(',') : null,
            keywords: matches.length > 0 ? matches.map(m => m.keyword).join(',') : null
          };
        });
        const count = await createNewsFlashes(items);
        inserted += count;
        await markNewsSourceSync(source.id, 'success', count);
      } catch (error) {
        console.error(`[sync-news] 源「${source.name}」抓取失败:`, error);
        await markNewsSourceSync(source.id, 'failed').catch(() => {});
      }
    }
    console.log(`[sync-news] 抓取 ${fetched} 条，新插入 ${inserted} 条`);
    return { fetched, inserted };
  } finally {
    running = false;
  }
};
