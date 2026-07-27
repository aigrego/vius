'use client';

import { toDetailCode } from '@/utils/stock-code';

interface StockChartProps {
  code: string;
  market: string;
  name: string;
}

/* K 线走势：与 /stock/[code] 详情页一致的选股宝图表组件（分时/日K/周K/月K/分钟）。
   该组件只支持 A 股；港股/美股显示占位提示。 */
export function StockChart({ code, market, name }: StockChartProps) {
  const fullCode = toDetailCode(code, market);
  const isAShare = /\.(SS|SZ|SH|BJ)$/i.test(fullCode);

  if (!isAShare) {
    return (
      <div className="h-[475px] flex items-center justify-center text-fg-3 rounded bg-gray-50">
        {name}（{fullCode}）暂不支持 K 线图表
      </div>
    );
  }

  return (
    <iframe
      src={`https://xuangubao.cn/tools/chart-widget/ashares/${fullCode}`}
      title={`${name} K线走势`}
      className="w-full h-[475px] rounded bg-gray-50 border-0"
    />
  );
}
