import { handleApiError } from '@/utils/api-response';
import { NextRequest, NextResponse } from 'next/server';
import { getStockSignals } from '@/model/StockSignal';
import prisma from '@/lib/prisma';

// 声明为动态路由
export const dynamic = 'force-dynamic';

const VALID_TYPES = ['bottom_volume', 'top_volume'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LIMIT = 500;

// GET /api/ashare/signals - 放量信号列表
// date 缺省时取最近一个有信号的日期
export const GET = async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type')?.trim() || undefined;
    let date = searchParams.get('date')?.trim() || undefined;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100)
    );

    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { code: 400, data: null, message: `type 仅支持 ${VALID_TYPES.join('/')}` },
        { status: 400 }
      );
    }

    if (date && !DATE_PATTERN.test(date)) {
      return NextResponse.json(
        { code: 400, data: null, message: 'date 格式应为 YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // 缺省日期：查最近一个有信号的交易日（库中 date 按 UTC 零点存储）
    if (!date) {
      const latest = await prisma.stockSignal.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true }
      });
      date = latest?.date.toISOString().slice(0, 10);
    }

    const signals = await getStockSignals({ type, date, limit });

    // detail 字段库中是 JSON 字符串，parse 成对象返回（解析失败保留原字符串）
    const list = signals.map(signal => {
      let detail: unknown = signal.detail;
      if (typeof signal.detail === 'string' && signal.detail) {
        try {
          detail = JSON.parse(signal.detail);
        } catch {
          // 忽略解析失败，原样返回
        }
      }
      return { ...signal, detail };
    });

    return NextResponse.json({
      code: 200,
      data: { list, date: date ?? null },
      message: '请求成功'
    });
  } catch (error) {
    return NextResponse.json(handleApiError(error), { status: 500 });
  }
};
