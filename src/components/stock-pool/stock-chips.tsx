'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid
} from 'recharts';

interface ChipBin {
  price: number;
  ratio: number;
}

interface ChipsData {
  bins: ChipBin[];
  profitRatio: number;
  avgCost: number;
  cost90: { low: number; high: number };
  cost70: { low: number; high: number };
}

interface StockChipsProps {
  code: string;
  market: string;
  currentPrice?: number;
}

// 筹码分布面板：横向条形图，现价以下（获利盘）红色、以上（套牢盘）绿色
export function StockChips({ code, market, currentPrice }: StockChipsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChipsData | null>(null);

  useEffect(() => {
    const fetchChips = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/ashare/stocks/${code}/chips?market=${market}`);
        const result = await res.json();

        if (result.code !== 200) {
          throw new Error(result.message || '获取筹码分布失败');
        }

        setData(result.data);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchChips();
  }, [code, market]);

  if (loading) {
    return (
      <div className="h-[350px] flex items-center justify-center text-fg-3">
        加载筹码分布...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[350px] flex flex-col items-center justify-center gap-2">
        <div className="text-yellow-400">⚠️ {error}</div>
        <div className="text-xs text-fg-3">筹码分布需要足够的日线数据，请稍后再试</div>
      </div>
    );
  }

  if (!data || data.bins.length === 0) {
    return (
      <div className="h-[350px] flex items-center justify-center text-fg-3">
        暂无筹码分布数据
      </div>
    );
  }

  // 现价判断：优先用外部传入的现价，否则用平均成本近似
  const price = currentPrice && currentPrice > 0 ? currentPrice : data.avgCost;

  // 后端 ratio 可能是 0-1 小数或 0-100 百分数，统一成百分数展示
  const maxRatio = Math.max(...data.bins.map(b => b.ratio));
  const scale = maxRatio <= 1 ? 100 : 1;
  const bins = data.bins.map(b => ({ ...b, pct: b.ratio * scale }));
  const profitRatioPct = data.profitRatio <= 1 ? data.profitRatio * 100 : data.profitRatio;

  return (
    <div>
      {/* 汇总指标 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg border border-border bg-bg px-3 py-2">
          <div className="text-xs text-fg-3">获利盘比例</div>
          <div className="text-lg font-mono font-bold text-red-400">
            {profitRatioPct.toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg border border-border bg-bg px-3 py-2">
          <div className="text-xs text-fg-3">平均成本</div>
          <div className="text-lg font-mono font-bold text-yellow-400">
            ¥{data.avgCost.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-bg px-3 py-2">
          <div className="text-xs text-fg-3">90% 成本区间</div>
          <div className="text-sm font-mono font-bold">
            ¥{data.cost90.low.toFixed(2)} - ¥{data.cost90.high.toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-bg px-3 py-2">
          <div className="text-xs text-fg-3">70% 成本区间</div>
          <div className="text-sm font-mono font-bold">
            ¥{data.cost70.low.toFixed(2)} - ¥{data.cost70.high.toFixed(2)}
          </div>
        </div>
      </div>

      {/* 筹码分布图 */}
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bins} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
            <XAxis
              type="number"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="price"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              width={70}
              tickFormatter={(v) => `¥${Number(v).toFixed(2)}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px'
              }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(value) => [`${Number(value).toFixed(2)}%`, '筹码占比']}
              labelFormatter={(label) => `价格: ¥${Number(label).toFixed(2)}`}
            />
            {price > 0 && (
              <ReferenceLine
                y={price}
                stroke="#fbbf24"
                strokeDasharray="3 3"
                label={{ value: '现价', fill: '#fbbf24', fontSize: 12 }}
              />
            )}
            <Bar dataKey="pct" name="筹码占比" radius={[0, 2, 2, 0]}>
              {bins.map((bin, i) => (
                <Cell
                  key={i}
                  fill={bin.price <= price ? '#ef4444' : '#22c55e'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-center gap-4 mt-2 text-xs text-fg-3">
        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-500 rounded-sm" />获利盘（现价以下）</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-500 rounded-sm" />套牢盘（现价以上）</span>
      </div>
    </div>
  );
}
