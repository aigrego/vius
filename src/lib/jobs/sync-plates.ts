// 板块行情缓存任务：交易时段每分钟刷新 行业/题材/涨幅榜/跌幅榜 四类板块数据写 plate_cache
// 页面只读库（/api/stocks/plates），不再每次请求回源第三方

import { fetchQqPlates, fetchXgbPlates } from '@/lib/plates';
import { upsertPlateCache, type PlateKind } from '@/model/PlateCache';

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
