// 告警检查核心逻辑（从 /api/alerts/check 路由抽出，供路由与定时任务复用）

import prisma from '@/lib/prisma';
import { Alert, AlertConfig, QuoteData, checkStockAlerts } from '@/lib/alerts';
import { pushAlertsToFeishu } from '@/lib/feishu';
import { fetchRealtimeQuotes, type RealtimeQuote } from '@/lib/realtime';
import { parseFullCode } from '@/lib/stock-code';
import { getAvgVolume, getTradesByDate } from '@/model/StockTrade';

// 告警冷却时间：同 code + alertType 30 分钟内只记录/推送一次
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

export interface AlertCheckOptions {
  force?: boolean; // 跳过冷却去重
  noFeishu?: boolean; // 不推送飞书
  userId?: string; // 只检查该用户的股票池（股票池已按账号隔离）
  username?: string; // 飞书推送标题里标注归属用户
}

export interface AlertCheckResult {
  checked: number; // 参与检查的股票数
  triggered: number; // 触发的告警数（冷却去重前）
  saved: number; // 实际写入的告警数
  skipped: number; // 冷却期跳过数
  alerts: Alert[];
  feishuSent: boolean;
}

const toNumber = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// 解析 alertsJson，兼容蛇形与驼峰两种 key
// 蛇形 key 与 src/types/stock-pool/stock.ts 的 StockAlerts 对应，驼峰 key 与 src/lib/alerts.ts 的参数对应
// cost_pct_above（成本上方百分比）→ profitPctAbove；cost_pct_below（负值）→ lossPctAbove（取绝对值）
export function normalizeAlertsJson(raw: Record<string, unknown>): AlertConfig['alerts'] {
  const pick = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const n = toNumber(raw[key]);
      if (n !== undefined) return n;
    }
    return undefined;
  };
  const costPctBelow = pick('cost_pct_below');
  return {
    priceAbove: pick('priceAbove', 'price_above'),
    priceBelow: pick('priceBelow', 'price_below'),
    changePctAbove: pick('changePctAbove', 'change_pct_above'),
    changePctBelow: pick('changePctBelow', 'change_pct_below'),
    volumeAbove: pick('volumeAbove', 'volume_ratio'),
    profitPctAbove: pick('profitPctAbove', 'cost_pct_above'),
    lossPctAbove: pick('lossPctAbove') ?? (costPctBelow !== undefined ? Math.abs(costPctBelow) : undefined)
  };
}

export async function runAlertCheck(options: AlertCheckOptions = {}): Promise<AlertCheckResult> {
  const { force = false, noFeishu = false, userId, username } = options;

  // 获取股票（传 userId 时只查该用户的池子）；名称/市场从 stock_dict 关联获得
  const stocks = await prisma.watchlist.findMany({
    ...(userId ? { where: { userId } } : {}),
    include: { stock: true }
  });

  // 价格来源优先读库（sync-snapshot 盘中每分钟/sync-daily 收盘后已落当日行，量比单位已是手）；
  // 库中无当日行（盘前/停牌/字典外股票）的代码兜底实时行情三源
  const fullCodes = stocks.map(s => s.stockCode);
  const trades = fullCodes.length > 0 ? await getTradesByDate(fullCodes) : new Map();
  const missingFullCodes = fullCodes.filter(c => trades.get(c)?.current == null);
  const realtimeByFullCode = new Map<string, RealtimeQuote>();
  if (missingFullCodes.length > 0) {
    const parsed = missingFullCodes.map(c => parseFullCode(c));
    const quotes = await fetchRealtimeQuotes(
      parsed.map(p => p.code),
      parsed.map(p => p.market.toLowerCase())
    );
    const fullCodeByBare = new Map(parsed.map((p, i) => [p.code.toUpperCase(), missingFullCodes[i]!]));
    for (const q of quotes) {
      const fullCode = fullCodeByBare.get(q.code.toUpperCase());
      if (fullCode) realtimeByFullCode.set(fullCode, q);
    }
  }

  const triggeredAlerts: Alert[] = [];

  // 检查每只股票的预警
  for (const stock of stocks) {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(stock.alertsJson || '{}');
    } catch {
      continue;
    }
    const alerts = normalizeAlertsJson(raw);
    if (Object.values(alerts).every(v => v === undefined)) continue;

    // 构造行情：库中当日行优先（volume 已是手，不做换算）；
    // 兜底实时行情的新浪源成交量单位是股（×100 适配均量），腾讯/东财源是手
    const trade = trades.get(stock.stockCode);
    const realtime = realtimeByFullCode.get(stock.stockCode);
    let quoteData: QuoteData | null = null;
    if (trade && trade.current != null) {
      const avg = await getAvgVolume(stock.stockCode, 5);
      quoteData = {
        current: trade.current,
        changePct: trade.changePct ?? 0,
        volume: trade.volume ?? 0,
        avgVolume: avg !== null && avg > 0 ? avg : undefined
      };
    } else if (realtime) {
      // 注入近 5 日均量（库中单位：手），修复 volumeAbove 因 avgVolume 缺失永不触发的问题
      const avg = await getAvgVolume(stock.stockCode, 5);
      quoteData = {
        current: realtime.current,
        changePct: realtime.changePct,
        volume: realtime.volume,
        avgVolume: avg !== null && avg > 0 ? (realtime.source === 'sina' ? avg * 100 : avg) : undefined
      };
    }
    if (!quoteData) continue;

    const stockConfig: AlertConfig = {
      code: stock.stockCode,
      name: stock.stock.name,
      cost: Number(stock.cost),
      alerts
    };

    const stockAlerts = checkStockAlerts(stockConfig, quoteData);

    triggeredAlerts.push(...stockAlerts);
  }

  // 冷却去重：同 code + alertType 30 分钟内已有记录则跳过（force=true 时跳过冷却检查）
  let alertsToSave = triggeredAlerts;
  let skippedCount = 0;
  if (!force && triggeredAlerts.length > 0) {
    const cooldownSince = new Date(Date.now() - ALERT_COOLDOWN_MS);
    const recentAlerts = await prisma.alertHistory.findMany({
      where: { createdAt: { gte: cooldownSince }, ...(userId ? { userId } : {}) },
      select: { code: true, alertType: true }
    });
    const recentKeys = new Set(recentAlerts.map(a => `${a.code}:${a.alertType}`));
    alertsToSave = triggeredAlerts.filter(a => !recentKeys.has(`${a.code}:${a.type}`));
    skippedCount = triggeredAlerts.length - alertsToSave.length;
  }

  // 批量写入数据库（带归属用户；code 为 fullCode，varchar(20) 够放）
  if (alertsToSave.length > 0) {
    // currentValue/thresholdValue 是 Decimal(10,4)（上限 10^6）：成交量类告警的值
    // 可能超过（大盘股日成交量可达数百万手），超出时钳制到上限防止 numeric overflow
    const fitDecimal = (v: number): number => Math.min(Math.max(v, -999999.9999), 999999.9999);
    await prisma.alertHistory.createMany({
      data: alertsToSave.map(alert => ({
        userId: userId ?? null,
        code: alert.code,
        alertType: alert.type,
        severity: alert.severity,
        message: alert.message,
        currentValue: fitDecimal(alert.currentValue),
        thresholdValue: fitDecimal(alert.thresholdValue)
      }))
    });
  }

  // 推送飞书（在写库之后，推送失败不影响已写入的告警记录）
  let feishuSent = false;
  if (!noFeishu && alertsToSave.length > 0) {
    const feishuResult = await pushAlertsToFeishu(alertsToSave, username);
    feishuSent = feishuResult.sent;
  }

  return {
    checked: stocks.length,
    triggered: triggeredAlerts.length,
    saved: alertsToSave.length,
    skipped: skippedCount,
    alerts: triggeredAlerts,
    feishuSent
  };
}

/* 定时任务入口：按用户分组逐池检查（股票池已按账号隔离），
   每个用户的告警单独落库、单独推飞书（标题带用户名）。 */
export async function runAlertCheckAll(options: Omit<AlertCheckOptions, 'userId' | 'username'> = {}) {
  const owners = await prisma.watchlist.findMany({
    select: { userId: true, user: { select: { username: true, name: true } } },
    distinct: ['userId']
  });

  const total = { checked: 0, triggered: 0, saved: 0, skipped: 0, feishuSent: false };
  for (const owner of owners) {
    const r = await runAlertCheck({
      ...options,
      userId: owner.userId,
      username: owner.user.name || owner.user.username
    });
    total.checked += r.checked;
    total.triggered += r.triggered;
    total.saved += r.saved;
    total.skipped += r.skipped;
    total.feishuSent = total.feishuSent || r.feishuSent;
  }
  return total;
}
