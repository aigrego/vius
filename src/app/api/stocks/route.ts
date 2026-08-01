import { handleApiError } from '@/utils/api-response'
import { NextRequest, NextResponse } from 'next/server';
import { getIndexDicts } from '@/model/StockDict';
import { parseFullCode } from '@/lib/stock-code';

// 声明为动态路由：数据来自数据库，避免构建期静态化/缓存
export const dynamic = 'force-dynamic';

// GET /api/stocks - 指数清单（旧 stock 表已并入 stock_dict type='index'）
// 保持旧契约字段：code（裸码）/ source（SH→SS 后缀风格）/ type（'ZS'），附带 name
export const GET = async (_: NextRequest) => {
    try {
        const indices = await getIndexDicts();
        const data = indices.map(d => {
            const { market, code } = parseFullCode(d.code);
            return {
                code,
                name: d.name,
                source: market === 'SH' ? 'SS' : market,
                type: 'ZS'
            };
        });
        return NextResponse.json({
            code: 200,
            data,
            message: '请求成功'
        });
    } catch (error) {
        return NextResponse.json(
            handleApiError(error),
            { status: error instanceof Error ? 404 : 200 }
        )
    }
}
