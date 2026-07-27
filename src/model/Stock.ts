import prisma from '@/lib/prisma';
import { StockSource, StockType } from '@prisma/client';

export type TStock = {
    code: string
    source: StockSource
    type: StockType
};

export const getStocks = async (): Promise<Array<TStock>> => { 
    return prisma.stock.findMany({
        select: {
            code: true,
            source: true,
            type: true
        },
    });
};