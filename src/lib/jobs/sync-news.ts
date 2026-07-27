// 资讯快讯抓取 + 股票关联任务
// 数据源：华尔街见闻、选股宝（原为前端直接调用，移到服务端定时落库）

import { getStockBasicMap } from '@/model/StockBasic';
import { createNewsFlashes, TNewsFlashInput } from '@/model/NewsFlash';

const NEWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface RawNewsItem {
  source: string;
  externalId: string;
  title: string | null;
  content: string;
  publishedAt: Date;
}

// 抓取华尔街见闻快讯（防御性解析：响应结构以实际为准，字段缺失直接跳过）
async function fetchWallstcnNews(): Promise<RawNewsItem[]> {
  const url = 'https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel&limit=50';
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

// 抓取选股宝快讯
async function fetchXuangubaoNews(): Promise<RawNewsItem[]> {
  const url = 'https://baoer-api.xuangubao.cn/api/v6/message/newsflash?subj_ids=9,10,723,35,469,821&limit=50';
  const response = await fetch(url, {
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

// 名称清洗：去掉 ST/*ST 前缀（ST 股在新闻中通常不带前缀）
const cleanStockName = (name: string): string =>
  name.replace(/^\*?ST/i, '').trim();

// 文本匹配股票代码：nameMap 为 name → code，includes 匹配
// 跳过：清洗后名称长度 <2（单字误配率高）、退市整理股（名称含「退」，如「文化退」，
// 清洗成「文化」会误配「文化和旅游部」这类宏观新闻）
export function matchStockCodes(text: string, nameMap: Map<string, string>): string[] {
  if (!text) return [];
  const codes = new Set<string>();
  for (const [name, code] of nameMap) {
    if (name.includes('退')) continue;
    const cleaned = cleanStockName(name);
    if (cleaned.length < 2) continue;
    if (text.includes(cleaned)) {
      codes.add(code);
    }
  }
  return [...codes];
}

// 抓取两个源 → 对每条计算关联股票 → 落库去重
export const syncNews = async (): Promise<{ fetched: number; inserted: number }> => {
  // 单源失败不影响另一个源
  const [wallstcn, xuangubao] = await Promise.allSettled([
    fetchWallstcnNews(),
    fetchXuangubaoNews()
  ]);
  const raw: RawNewsItem[] = [];
  if (wallstcn.status === 'fulfilled') raw.push(...wallstcn.value);
  else console.error('[sync-news] 见闻抓取失败:', wallstcn.reason);
  if (xuangubao.status === 'fulfilled') raw.push(...xuangubao.value);
  else console.error('[sync-news] 选股宝抓取失败:', xuangubao.reason);

  if (raw.length === 0) return { fetched: 0, inserted: 0 };

  // code → {name, market} 反转为 name → code
  const basicMap = await getStockBasicMap();
  const nameMap = new Map<string, string>();
  for (const [code, basic] of basicMap) {
    nameMap.set(basic.name, code);
  }

  const items: TNewsFlashInput[] = raw.map(item => {
    const text = `${item.title ?? ''} ${item.content}`;
    const codes = matchStockCodes(text, nameMap);
    return {
      ...item,
      codes: codes.length > 0 ? codes.join(',') : null
    };
  });

  const inserted = await createNewsFlashes(items);
  console.log(`[sync-news] 抓取 ${raw.length} 条，新插入 ${inserted} 条`);
  return { fetched: raw.length, inserted };
};
