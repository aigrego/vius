'use client';

import { useEffect, useRef, useState } from 'react';
import { toDetailCode } from '@/utils/stock-code';

interface StockChartProps {
  code: string;
  market: string;
  name: string;
}

/* K 线走势：与 /stock/[code] 详情页一致的选股宝图表组件（分时/日K/周K/月K/分钟）。
   该组件只支持 A 股；港股/美股显示占位提示。
   选股宝组件内部版心固定 780×475（indice-xl），不随 iframe 变宽；
   这里量出容器宽度后用 CSS zoom 等比放大 iframe，铺满弹窗宽度（矢量重绘，清晰不糊）。 */
const WIDGET_W = 780;
const WIDGET_H = 475;

export function StockChart({ code, market, name }: StockChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth > 0 ? el.clientWidth / WIDGET_W : 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    <div
      ref={wrapRef}
      className="w-full overflow-hidden rounded bg-gray-50"
      style={{ height: WIDGET_H * scale }}
    >
      <iframe
        src={`https://xuangubao.cn/tools/chart-widget/ashares/${fullCode}`}
        title={`${name} K线走势`}
        className="block border-0"
        style={{ width: WIDGET_W, height: WIDGET_H, zoom: scale }}
      />
    </div>
  );
}
