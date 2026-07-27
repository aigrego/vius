'use client';

import { useEffect, useState } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { calculateAllIndicators, KLineData } from '@/lib/technical';
import { TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';

interface StockChartProps {
  code: string;
  market: string;
  name?: string;
}

interface ChartData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
  ma60?: number;
  dif?: number;
  dea?: number;
  macd?: number;
  rsi6?: number;
  rsi12?: number;
  rsi24?: number;
  bollUpper?: number;
  bollMiddle?: number;
  bollLower?: number;
}

interface CurrentPrice {
  close: number;
  changePct: number;
}

type ChartTab = 'kline' | 'macd' | 'rsi';

export function StockChart({ code, market, name }: StockChartProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [currentPrice, setCurrentPrice] = useState<CurrentPrice | null>(null);
  // vius 的 Tabs 是受控组件且无 TabsContent，这里手动管理当前面板
  const [chartTab, setChartTab] = useState<ChartTab>('kline');

  useEffect(() => {
    fetchKLineData();
  }, [code, market]);

  const fetchKLineData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/stock-pool/api/stocks/${code}/kline?market=${market}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      const klineData: KLineData[] = result.data;

      if (klineData.length > 0) {
        const latest = klineData[klineData.length - 1]!;
        const prev = klineData.length > 1 ? klineData[klineData.length - 2]! : latest;
        setCurrentPrice({
          close: latest.close,
          changePct: ((latest.close - prev.close) / prev.close * 100)
        });
      }

      // 计算技术指标
      const indicators = calculateAllIndicators(klineData);

      // 合并数据
      const merged: ChartData[] = klineData.map((k, i) => ({
        date: k.date.slice(5), // MM-DD
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
        ma5: indicators.ma[i]?.ma5,
        ma10: indicators.ma[i]?.ma10,
        ma20: indicators.ma[i]?.ma20,
        ma60: indicators.ma[i]?.ma60,
        dif: indicators.macd.find(m => m.date === k.date)?.dif,
        dea: indicators.macd.find(m => m.date === k.date)?.dea,
        macd: indicators.macd.find(m => m.date === k.date)?.macd,
        rsi6: indicators.rsi.find(r => r.date === k.date)?.rsi6,
        rsi12: indicators.rsi.find(r => r.date === k.date)?.rsi12,
        rsi24: indicators.rsi.find(r => r.date === k.date)?.rsi24,
        bollUpper: indicators.bollinger.find(b => b.date === k.date)?.upper,
        bollMiddle: indicators.bollinger.find(b => b.date === k.date)?.middle,
        bollLower: indicators.bollinger.find(b => b.date === k.date)?.lower,
      }));

      setChartData(merged);
      setPatterns(indicators.patterns.slice(-5)); // 最近5个形态

    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-surface border-border">
        <CardContent className="h-[400px] flex items-center justify-center">
          <div className="text-fg-3">加载图表数据...⏳</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-surface border-border">
        <CardContent className="h-[400px] flex items-center justify-center">
          <div className="text-red-400">❌ {error}</div>
        </CardContent>
      </Card>
    );
  }

  const isUp = (currentPrice?.changePct || 0) >= 0;

  return (
    <Card className="bg-surface border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">
              {name || code} ({market.toUpperCase()})
            </CardTitle>
            {currentPrice && (
              <div className="flex items-center gap-2">
                <span className="text-xl font-mono font-bold">
                  ¥{currentPrice.close.toFixed(2)}
                </span>
                <Badge tone={isUp ? 'success' : 'danger'}>
                  {isUp ? '+' : ''}{currentPrice.changePct.toFixed(2)}%
                </Badge>
              </div>
            )}
          </div>

          {/* 形态识别 */}
          {patterns.length > 0 && (
            <div className="flex gap-2">
              {patterns.slice(0, 3).map((p, i) => (
                <Badge
                  key={i}
                  tone={p.significance === 'high' ? 'warning' : 'blue'}
                >
                  {p.pattern}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={chartTab} onValueChange={(v) => setChartTab(v as ChartTab)} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="kline" className="gap-1">
              <BarChart3 className="w-4 h-4" /> K线
            </TabsTrigger>
            <TabsTrigger value="macd" className="gap-1">
              <Activity className="w-4 h-4" /> MACD
            </TabsTrigger>
            <TabsTrigger value="rsi" className="gap-1">
              <TrendingUp className="w-4 h-4" /> RSI
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* K线 + 均线 + 布林带（保持挂载，hidden 切换避免图表重渲染） */}
        <div className={chartTab === 'kline' ? 'h-[350px]' : 'hidden'}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                tickFormatter={(v) => `¥${v}`}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: '#94a3b8' }}
              />

              {/* 布林带 */}
              <Line
                type="monotone"
                dataKey="bollUpper"
                stroke="#94a3b8"
                strokeWidth={1}
                dot={false}
                name="上轨"
              />
              <Line
                type="monotone"
                dataKey="bollMiddle"
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
                name="中轨"
              />
              <Line
                type="monotone"
                dataKey="bollLower"
                stroke="#94a3b8"
                strokeWidth={1}
                dot={false}
                name="下轨"
              />

              {/* 均线 */}
              <Line
                type="monotone"
                dataKey="ma5"
                stroke="#fbbf24"
                strokeWidth={1.5}
                dot={false}
                name="MA5"
              />

              <Line
                type="monotone"
                dataKey="ma10"
                stroke="#60a5fa"
                strokeWidth={1.5}
                dot={false}
                name="MA10"
              />

              <Line
                type="monotone"
                dataKey="ma20"
                stroke="#c084fc"
                strokeWidth={1.5}
                dot={false}
                name="MA20"
              />

              <Line
                type="monotone"
                dataKey="ma60"
                stroke="#f87171"
                strokeWidth={1.5}
                dot={false}
                name="MA60"
              />

              {/* 收盘价 */}
              <Line
                type="monotone"
                dataKey="close"
                stroke={isUp ? "#22c55e" : "#ef4444"}
                strokeWidth={2}
                dot={false}
                name="收盘"
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="flex justify-center gap-4 mt-2 text-xs text-fg-3">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-400" />MA5</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400" />MA10</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-400" />MA20</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400" />MA60</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-400 dashed" />布林带</span>
          </div>
        </div>

        {/* MACD */}
        <div className={chartTab === 'macd' ? 'h-[350px]' : 'hidden'}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px'
                }}
              />

              <ReferenceLine y={0} stroke="#64748b" />

              <Bar
                dataKey="macd"
                fill="#3b82f6"
                name="MACD"
              />

              <Line
                type="monotone"
                dataKey="dif"
                stroke="#fbbf24"
                strokeWidth={2}
                dot={false}
                name="DIF"
              />

              <Line
                type="monotone"
                dataKey="dea"
                stroke="#f472b6"
                strokeWidth={2}
                dot={false}
                name="DEA"
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="flex justify-center gap-4 mt-2 text-xs text-fg-3">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-400" />DIF</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-pink-400" />DEA</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-500" />MACD</span>
          </div>
        </div>

        {/* RSI */}
        <div className={chartTab === 'rsi' ? 'h-[350px]' : 'hidden'}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px'
                }}
              />

              <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label="超买" />
              <ReferenceLine y={50} stroke="#64748b" strokeDasharray="3 3" />
              <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" label="超卖" />

              <Line
                type="monotone"
                dataKey="rsi6"
                stroke="#fbbf24"
                strokeWidth={2}
                dot={false}
                name="RSI6"
              />

              <Line
                type="monotone"
                dataKey="rsi12"
                stroke="#60a5fa"
                strokeWidth={1.5}
                dot={false}
                name="RSI12"
              />

              <Line
                type="monotone"
                dataKey="rsi24"
                stroke="#c084fc"
                strokeWidth={1.5}
                dot={false}
                name="RSI24"
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="flex justify-center gap-4 mt-2 text-xs text-fg-3">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-400" />RSI6</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400" />RSI12</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-400" />RSI24</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
