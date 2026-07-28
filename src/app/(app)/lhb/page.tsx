'use client';

import { useCallback, useEffect, useState, ComponentProps } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SegBtn } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, ChevronUp, ChevronDown } from 'lucide-react';

// 与 GET /api/lhb 返回结构一致
interface LhbStockItem {
  id: number;
  code: string;
  name: string;
  market: string; // sh / sz / bj
  closePrice: number;
  changePct: number;
  amount: number;
  reason: string;
  tradeId: string;
  netAmt: number;
}

interface LhbSeatItem {
  id: number;
  direction: string;
  rank: number;
  deptName: string;
  buy: number;
  sell: number;
  net: number;
}

interface LhbResponse {
  date: string | null;
  dates: string[];
  counts: Record<string, number>;
  total: number;
  list: LhbStockItem[];
}

type MarketTab = '' | 'sh' | 'sz' | 'bj';
type BadgeTone = ComponentProps<typeof Badge>['tone'];

const MARKET_TABS: { key: MarketTab; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'sh', label: '沪市龙虎榜' },
  { key: 'sz', label: '深市龙虎榜' },
  { key: 'bj', label: '北交所龙虎榜' },
];

const MARKET_BADGES: Record<string, { text: string; tone: BadgeTone }> = {
  sh: { text: '沪', tone: 'danger' },
  sz: { text: '深', tone: 'blue' },
  bj: { text: '北', tone: 'purple' },
};

// 金额格式化：>=1亿 显示 x.xx亿，否则 x.xx万；signed 时正数带 +
const fmtAmt = (v: number, signed = false): string => {
  const sign = signed && v > 0 ? '+' : '';
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${sign}${(v / 1e8).toFixed(2)}亿`;
  if (abs >= 1e3) return `${sign}${(v / 1e4).toFixed(2)}万`;
  return `${sign}${v.toFixed(0)}`;
};

// 涨跌语义色（红涨绿跌/绿涨红跌由主题变量决定）
const updownCls = (v: number): string => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-fg-2');

export default function LhbPage() {
  const [data, setData] = useState<LhbResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(''); // 空 = 最新日期（由接口决定）
  const [market, setMarket] = useState<MarketTab>('');
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');

  // 行展开：key = code-tradeId；席位数据按 key 缓存
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [seatsMap, setSeatsMap] = useState<Record<string, { buy: LhbSeatItem[]; sell: LhbSeatItem[] } | 'loading'>>({});

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (market) params.set('market', market);
      if (appliedKeyword) params.set('keyword', appliedKeyword);
      const res = await fetch(`/api/lhb?${params.toString()}`);
      const result = await res.json();
      if (result.code !== 200) throw new Error(result.message || '获取龙虎榜失败');
      setData(result.data);
      // 接口会回显实际生效的日期（缺省取最新）
      if (result.data.date) setDate(result.data.date);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [date, market, appliedKeyword]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 展开/收起行，首次展开时拉席位明细
  const toggleExpand = async (item: LhbStockItem) => {
    const key = `${item.code}-${item.tradeId}`;
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    if (seatsMap[key]) return;
    setSeatsMap(prev => ({ ...prev, [key]: 'loading' }));
    try {
      const res = await fetch(`/api/lhb/seats?code=${item.code}&date=${data?.date ?? date}`);
      const result = await res.json();
      if (result.code !== 200) throw new Error(result.message || '获取席位明细失败');
      setSeatsMap(prev => ({ ...prev, [key]: result.data }));
    } catch {
      setSeatsMap(prev => ({ ...prev, [key]: { buy: [], sell: [] } }));
    }
  };

  const counts = data?.counts ?? { all: 0, sh: 0, sz: 0, bj: 0 };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-6">
      {/* 页头 */}
      <div>
        <h1 className="text-[20px] font-semibold text-fg-1">龙虎榜</h1>
        <p className="mt-1 text-[13px] text-fg-3">沪深北交易所公布的异动个股龙虎榜数据</p>
      </div>

      {/* 市场 tab */}
      <div className="inline-flex gap-0.5 rounded-lg bg-surface-2 p-1">
        {MARKET_TABS.map(t => (
          <SegBtn key={t.key} active={market === t.key} onClick={() => setMarket(t.key)}>
            {t.label}
            <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-fg-3">
              {counts[t.key || 'all'] ?? 0}
            </span>
          </SegBtn>
        ))}
      </div>

      {/* 工具条 */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <span className="text-[13px] text-fg-3">日期</span>
          <Select value={date} onValueChange={setDate}>
            <SelectTrigger className="w-[150px]" placeholder="选择日期" />
            <SelectContent>
              {(data?.dates ?? []).map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="w-[220px]"
            placeholder="搜索名称/代码"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setAppliedKeyword(keyword.trim()); }}
          />
          <Button size="md" onClick={() => setAppliedKeyword(keyword.trim())}>
            <Search size={14} />
            搜索
          </Button>
          <span className="ml-auto text-[12.5px] text-fg-3">
            {data?.date ? `${data.date} · 共 ${counts.all ?? 0} 只个股上榜` : ''}
          </span>
        </CardContent>
      </Card>

      {/* 榜单 */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>市场</TableHead>
                <TableHead className="text-right">收盘价</TableHead>
                <TableHead className="text-right">涨跌幅</TableHead>
                <TableHead className="text-right">成交额</TableHead>
                <TableHead>上榜原因</TableHead>
                <TableHead className="text-right">龙虎榜净买入</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-fg-3">加载中…</TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-danger">{error}</TableCell>
                </TableRow>
              )}
              {!loading && !error && (data?.list.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-fg-3">
                    暂无数据（可在 /cron 手动触发「龙虎榜同步」，或 POST /api/ashare/sync?type=lhb）
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && data?.list.map(item => {
                const key = `${item.code}-${item.tradeId}`;
                const expanded = expandedKey === key;
                const seats = seatsMap[key];
                const badge = MARKET_BADGES[item.market] ?? { text: item.market, tone: 'neutral' as BadgeTone };
                return [
                  <TableRow key={key} className={expanded ? 'bg-surface-2' : ''}>
                    <TableCell className="font-mono">{item.code}</TableCell>
                    <TableCell>
                      <Link href={`/stock/${item.code}`} className="font-medium hover:text-brand-blue hover:underline">
                        {item.name}
                      </Link>
                    </TableCell>
                    <TableCell><Badge tone={badge.tone}>{badge.text}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{item.closePrice.toFixed(2)}</TableCell>
                    <TableCell className={`text-right font-mono font-medium ${updownCls(item.changePct)}`}>
                      {item.changePct > 0 ? '+' : ''}{item.changePct.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtAmt(item.amount)}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-fg-2" title={item.reason}>{item.reason}</TableCell>
                    <TableCell
                      className={`cursor-pointer select-none text-right font-mono font-medium ${updownCls(item.netAmt)}`}
                      onClick={() => toggleExpand(item)}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {fmtAmt(item.netAmt, true)}
                        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </span>
                    </TableCell>
                  </TableRow>,
                  expanded && (
                    <TableRow key={`${key}-seats`} className="hover:bg-transparent">
                      <TableCell colSpan={8} className="bg-surface-2/50 px-6 py-4">
                        {seats === 'loading' || !seats ? (
                          <div className="py-4 text-center text-[12.5px] text-fg-3">席位明细加载中…</div>
                        ) : (
                          <SeatPanels buy={seats.buy} sell={seats.sell} />
                        )}
                      </TableCell>
                    </TableRow>
                  ),
                ];
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// 买入前五 / 卖出前五 并排面板
function SeatPanels({ buy, sell }: { buy: LhbSeatItem[]; sell: LhbSeatItem[] }) {
  const buyTotal = buy.reduce((acc, s) => acc + s.buy, 0);
  const sellTotal = sell.reduce((acc, s) => acc + s.sell, 0);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <SeatTable title="买入前五" titleCls="text-up" total={fmtAmt(buyTotal)} rows={buy} />
      <SeatTable title="卖出前五" titleCls="text-down" total={fmtAmt(sellTotal)} rows={sell} />
    </div>
  );
}

function SeatTable({ title, titleCls, total, rows }: { title: string; titleCls: string; total: string; rows: LhbSeatItem[] }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2 text-[13px]">
        <span className={`font-semibold ${titleCls}`}>{title}</span>
        <span className="text-fg-3">合计: {total}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>营业部/机构</TableHead>
            <TableHead className="text-right">买入额</TableHead>
            <TableHead className="text-right">卖出额</TableHead>
            <TableHead className="text-right">净额</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-4 text-center text-fg-3">无数据</TableCell>
            </TableRow>
          )}
          {rows.map(s => (
            <TableRow key={s.id}>
              <TableCell className="text-fg-3">{s.rank}</TableCell>
              <TableCell className="max-w-[280px] truncate" title={s.deptName}>{s.deptName}</TableCell>
              <TableCell className="text-right font-mono">{s.buy > 0 ? fmtAmt(s.buy) : '0'}</TableCell>
              <TableCell className="text-right font-mono">{s.sell > 0 ? fmtAmt(s.sell) : '0'}</TableCell>
              <TableCell className={`text-right font-mono font-medium ${updownCls(s.net)}`}>{fmtAmt(s.net, true)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
