// 板块行情缓存任务：交易时段每分钟刷新 行业/题材/涨幅榜/跌幅榜 四类板块数据写 plate_cache
// 页面只读库（/api/stocks/plates），不再每次请求回源第三方
// 另含 syncPlateStocks：每日盘前从 plate_cache 提取板块清单落 plate 表，并回源抓成分股落 plate_stock

import { fetchQqPlates, fetchXgbPlates } from '@/lib/plates';
import { upsertPlateCache, getPlateCache, type PlateKind } from '@/model/PlateCache';
import { upsertPlates, replacePlateStocks, type TPlateItem } from '@/model/Plate';
import { upsertStockDicts, type TStockDictItem } from '@/model/StockDict';
import { normalizeMarket } from '@/lib/stock-code';

// 北京时区当前分钟数（0-1439）
const getBeijingMinutes = (): number => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return now.getHours() * 60 + now.getMinutes();
};

// 各 kind 的采集函数（payload 统一 JSON.stringify 后落库）
const COLLECTORS: Record<PlateKind, () => Promise<string>> = {
  qq_hy: async () => JSON.stringify(await fetchQqPlates('hy')),
  qq_gn: async () => JSON.stringify(await fetchQqPlates('gn')),
  xgb_rise: async () => JSON.stringify(await fetchXgbPlates(true)),
  xgb_fall: async () => JSON.stringify(await fetchXgbPlates(false))
};

export const syncPlates = async (): Promise<{ refreshed: string[]; failed: string[] }> => {
  // 仅交易时段刷新（9:30-15:00 北京时间），其余时间页面读最后一次快照即可
  const minutes = getBeijingMinutes();
  if (minutes < 9 * 60 + 30 || minutes > 15 * 60) {
    return { refreshed: [], failed: [] };
  }

  const refreshed: string[] = [];
  const failed: string[] = [];
  // 单类失败不影响其他类
  await Promise.all(
    (Object.keys(COLLECTORS) as PlateKind[]).map(async kind => {
      try {
        const payload = await COLLECTORS[kind]();
        await upsertPlateCache(kind, payload);
        refreshed.push(kind);
      } catch (error) {
        console.error(`[sync-plates] ${kind} 刷新失败:`, error);
        failed.push(kind);
      }
    })
  );
  console.log(`[sync-plates] 刷新 ${refreshed.length} 类${failed.length > 0 ? `，失败: ${failed.join(',')}` : ''}`);
  return { refreshed, failed };
};

// 冷启动兜底：缓存缺失时直接回源写库（API 层调用，不受交易时段限制）
export const refreshPlateKind = async (kind: PlateKind): Promise<string> => {
  const payload = await COLLECTORS[kind]();
  await upsertPlateCache(kind, payload);
  return payload;
};

/* ---------- 板块成分股（每日盘前一次，成分变化慢，不随行情高频刷新） ---------- */

const PLATE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 成分股条目：fullCode + 字典懒建所需的名称/市场
interface ConstituentItem {
  fullCode: string;
  name: string;
  market: string;
}

// 选股宝 symbol（600143.SS / 300170.SZ）→ 成分股条目；非 A 股格式返回 null
const parseXgbSymbol = (symbol: unknown, chiName: unknown): ConstituentItem | null => {
  if (typeof symbol !== 'string' || typeof chiName !== 'string' || !chiName) return null;
  const m = symbol.match(/^(\d{6})\.(SS|SZ|SH|BJ)$/i);
  if (!m) return null;
  const market = normalizeMarket(m[2]!.toUpperCase());
  return { fullCode: `${market}${m[1]}`, name: chiName, market };
};

// 腾讯成分股代码（sz300364 / sh600519 / bj920001）→ 成分股条目；非 A 股格式返回 null
const parseQqCode = (code: unknown, name: unknown): ConstituentItem | null => {
  if (typeof code !== 'string' || typeof name !== 'string' || !name) return null;
  const m = code.match(/^(sh|sz|bj)(\d{6})$/i);
  if (!m) return null;
  const market = m[1]!.toUpperCase();
  return { fullCode: `${market}${m[2]}`, name, market };
};

// 读某类板块缓存；缓存缺失时直接回源（盘前首次运行时 plate_cache 可能还没有当日快照）
const readPlatePayload = async (kind: PlateKind): Promise<any> => {
  const cache = await getPlateCache(kind);
  if (cache) return JSON.parse(cache.payload);
  return JSON.parse(await refreshPlateKind(kind));
};

// 选股宝全量成分股探测（2026-08 实测：plate/data 的 stock_list 字段恒为 null、
// baoer-api /api/v6/plate/<id>/stocks 返回 Not Found，全量成分接口不可用 → 走 top_n_stocks 降级。
// 保留探测逻辑：若上游哪天开放该字段即自动升级为全量）
const fetchXgbFullConstituents = async (plateId: number): Promise<ConstituentItem[] | null> => {
  try {
    const resp = await fetch(
      `https://flash-api.xuangubao.cn/api/plate/data?plates=${plateId}&fields=stock_list`,
      { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': PLATE_UA } }
    );
    if (!resp.ok) return null;
    const json = await resp.json();
    const list = json?.data?.[String(plateId)]?.stock_list;
    if (!Array.isArray(list) || list.length === 0) return null;
    const items = list
      .map((s: any) => parseXgbSymbol(s?.symbol, s?.stock_chi_name))
      .filter((s): s is ConstituentItem => !!s);
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
};

// 腾讯板块成分股（2026-08 实测可用，需带 Referer；board_code 形如 pt01801760）
// 拿不到返回 null——qq 板块只有行情无成分不算错误，跳过即可
const fetchQqConstituents = async (boardCode: string): Promise<ConstituentItem[] | null> => {
  try {
    const url =
      `https://proxy.finance.qq.com/cgi/cgi-bin/rank/hs/getBoardRankList` +
      `?board_code=${boardCode}&sort_type=priceRatio&direct=down&offset=0&count=200`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Referer: 'https://stockapp.finance.qq.com', 'User-Agent': PLATE_UA }
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const list = json?.data?.rank_list;
    if (!Array.isArray(list) || list.length === 0) return null;
    const items = list
      .map((s: any) => parseQqCode(s?.code, s?.name))
      .filter((s): s is ConstituentItem => !!s);
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
};

// 同步板块清单 + 成分股：
// a. plate_cache 的 xgb_rise/xgb_fall → plate（xgb:<plate_id>，concept）；qq_hy/qq_gn → plate（qq:<code>，industry/concept）
// b. xgb 成分：先探全量接口，拿不到降级用缓存 payload 里的 top_n_stocks.items
// c. qq 成分：getBoardRankList 全量（≤200）；拿不到跳过不算错误
// 成分股统一 ensure 进 stock_dict（懒建）后整体替换 plate_stock
export const syncPlateStocks = async (): Promise<{ plates: number; constituents: number }> => {
  const [xgbRise, xgbFall, qqHy, qqGn] = await Promise.all([
    readPlatePayload('xgb_rise'),
    readPlatePayload('xgb_fall'),
    readPlatePayload('qq_hy'),
    readPlatePayload('qq_gn')
  ]);

  // a. 板块清单（涨幅榜与跌幅榜的板块可能重叠，按 code 去重）
  const plateMap = new Map<string, TPlateItem>();
  const xgbPayloads: any[] = [];
  for (const payload of [xgbRise, xgbFall]) {
    if (!Array.isArray(payload)) continue;
    xgbPayloads.push(...payload);
    for (const p of payload) {
      const id = p?.plate_id;
      const name = p?.plate_name;
      if (typeof id !== 'number' || typeof name !== 'string' || !name) continue;
      plateMap.set(`xgb:${id}`, { code: `xgb:${id}`, name, kind: 'concept', source: 'xgb' });
    }
  }
  const qqBoards: { boardCode: string; kind: string }[] = [];
  for (const [payload, kind] of [[qqHy, 'industry'], [qqGn, 'concept']] as const) {
    const rankList = payload?.data?.rank_list;
    if (!Array.isArray(rankList)) continue;
    for (const item of rankList) {
      const code = item?.code;
      const name = item?.name;
      if (typeof code !== 'string' || typeof name !== 'string' || !code || !name) continue;
      plateMap.set(`qq:${code}`, { code: `qq:${code}`, name, kind, source: 'qq' });
      qqBoards.push({ boardCode: code, kind });
    }
  }
  const plates = [...plateMap.values()];
  await upsertPlates(plates);
  console.log(`[sync-plates] 板块清单落库 ${plates.length} 个（xgb ${plates.filter(p => p.source === 'xgb').length}，qq ${plates.filter(p => p.source === 'qq').length}）`);

  // b/c. 逐板块抓成分股；先收集字典懒建条目，最后一次性 upsert（高 RTT 链路下逐股 ensure 太慢）
  const dictItems = new Map<string, TStockDictItem>();
  const plateStocks = new Map<string, string[]>(); // plateCode → fullCodes

  for (const p of xgbPayloads) {
    const id = p?.plate_id;
    if (typeof id !== 'number') continue;
    const plateCode = `xgb:${id}`;
    if (plateStocks.has(plateCode)) continue; // 涨/跌幅榜重叠板块只处理一次
    // 先探全量成分接口；降级用缓存里的 top_n_stocks
    let items = await fetchXgbFullConstituents(id);
    if (!items) {
      const topItems = p?.top_n_stocks?.items;
      items = Array.isArray(topItems)
        ? topItems.map((s: any) => parseXgbSymbol(s?.symbol, s?.stock_chi_name)).filter((s): s is ConstituentItem => !!s)
        : [];
    }
    const fullCodes: string[] = [];
    for (const item of items) {
      fullCodes.push(item.fullCode);
      if (!dictItems.has(item.fullCode)) dictItems.set(item.fullCode, { code: item.fullCode, name: item.name, market: item.market });
    }
    plateStocks.set(plateCode, [...new Set(fullCodes)]);
    await sleep(150); // 温和节流，选股宝对高频敏感
  }

  for (const { boardCode } of qqBoards) {
    const plateCode = `qq:${boardCode}`;
    if (plateStocks.has(plateCode)) continue;
    const items = await fetchQqConstituents(boardCode);
    if (!items) {
      console.warn(`[sync-plates] qq 板块 ${plateCode} 成分获取失败，跳过（保留旧成分）`);
      await sleep(150);
      continue;
    }
    const fullCodes: string[] = [];
    for (const item of items) {
      fullCodes.push(item.fullCode);
      if (!dictItems.has(item.fullCode)) dictItems.set(item.fullCode, { code: item.fullCode, name: item.name, market: item.market });
    }
    plateStocks.set(plateCode, [...new Set(fullCodes)]);
    await sleep(150);
  }

  // 字典懒建 + 成分整体替换
  await upsertStockDicts([...dictItems.values()]);
  let constituents = 0;
  for (const [plateCode, fullCodes] of plateStocks) {
    try {
      constituents += await replacePlateStocks(plateCode, fullCodes);
    } catch (error) {
      console.error(`[sync-plates] ${plateCode} 成分写库失败:`, error);
    }
  }
  console.log(`[sync-plates] 成分股同步完成：${plateStocks.size} 个板块，${constituents} 条关联`);
  return { plates: plates.length, constituents };
};
