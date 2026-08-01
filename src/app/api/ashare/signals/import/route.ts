import { handleApiError } from '@/utils/api-response';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRouteAccess } from '@/lib/route-perm';
import { parseVolumeCsv } from '@/lib/analysis/import-volume-signals';
import { importStockSignals } from '@/model/StockSignal';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const VALID_TYPES = ['bottom_volume', 'top_volume'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CSV_BYTES = 2 * 1024 * 1024;

/* POST /api/ashare/signals/import - 导入外部工具计算的放量信号 CSV
   body: { csv: string, date: 'YYYY-MM-DD', type: 'bottom_volume'|'top_volume' }
   覆盖写 (stockCode,date,type) 已有行的 detail；字典缺失的代码跳过并在响应里带回 */
export const POST = async (request: NextRequest) => {
  try {
    // 路由权限：/analysis 写档校验（ro/hidden 均 403）
    const auth = await requireRouteAccess('/analysis', { write: true });
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => null);
    const csv = typeof body?.csv === 'string' ? body.csv : '';
    const date = typeof body?.date === 'string' ? body.date.trim() : '';
    const type = typeof body?.type === 'string' ? body.type.trim() : '';

    if (!csv) {
      return NextResponse.json({ code: 400, data: null, message: 'csv 内容为空' }, { status: 400 });
    }
    if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
      return NextResponse.json({ code: 400, data: null, message: '文件过大（上限 2MB）' }, { status: 400 });
    }
    if (!DATE_PATTERN.test(date)) {
      return NextResponse.json({ code: 400, data: null, message: 'date 格式应为 YYYY-MM-DD' }, { status: 400 });
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { code: 400, data: null, message: `type 仅支持 ${VALID_TYPES.join('/')}` },
        { status: 400 }
      );
    }

    const { rows, invalid } = parseVolumeCsv(csv);
    if (rows.length === 0) {
      return NextResponse.json(
        { code: 400, data: null, message: '无法识别文件格式：需包含 代码/收盘价/放量倍数 列' },
        { status: 400 }
      );
    }

    // stock_signal 外键关联 stock_dict：字典缺失的代码跳过（数量少时逐个查即可）
    const dictRows = await prisma.stockDict.findMany({
      where: { code: { in: rows.map(r => r.fullCode) } },
      select: { code: true }
    });
    const inDict = new Set(dictRows.map(d => d.code));
    const skipped = rows.filter(r => !inDict.has(r.fullCode)).map(r => r.fullCode);
    const valid = rows.filter(r => inDict.has(r.fullCode));

    await importStockSignals(valid.map(r => ({
      stockCode: r.fullCode,
      date,
      type,
      detail: JSON.stringify({
        volumeRatio: r.volumeRatio,
        position: null, // 外部文件无 120 日区间数据，位置分位不可得
        changePct: r.changePct,
        close: r.close,
        drawdown: r.drawdown,
        yearHigh: r.yearHigh,
        highDate: r.highDate,
        dayVolume: r.dayVolume,
        avgVolume20: r.avgVolume20,
        source: 'import'
      })
    })));

    return NextResponse.json({
      code: 200,
      data: { imported: valid.length, skipped, invalid, date, type },
      message: '请求成功'
    });
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 });
  }
};
