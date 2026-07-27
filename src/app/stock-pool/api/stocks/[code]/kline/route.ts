import { NextResponse } from 'next/server';

export interface KLineData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

// 新浪财经 K 线 API
// 获取日K数据
async function fetchSinaDailyKLine(code: string, market: string): Promise<KLineData[]> {
  const sinaCode = market === 'sh' ? `sh${code}` : 
                    market === 'sz' ? `sz${code}` :
                    market === 'hk' ? `hk${code}` :
                    market === 'us' ? `gb_${code.toLowerCase()}` : code;
  
  // 新浪财经 K 线数据 URL
  const url = `https://quotes.sina.cn/cn/api/quotes.php?symbol=${sinaCode}&datasource=quotes&textapi=chart/days`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const text = await response.text();
    
    // 解析返回的 JS 数据
    // 格式: var day_data = [[日期, 开盘, 最高, 最低, 收盘, 成交量], ...]
    const match = text.match(/var\s+day_data\s*=\s*(\[[\s\S]*?\]);/);
    if (!match) throw new Error('Invalid response format');
    
    const data = JSON.parse(match[1]!);
    
    return data.map((item: any[]) => ({
      date: item[0],
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseInt(item[5]),
      amount: parseFloat(item[6]) || 0
    }));
    
  } catch (error) {
    console.error('Failed to fetch K-line:', error);
    return [];
  }
}

// 东方财富 K 线 API
async function fetchEastMoneyKLine(code: string, market: string, period: string = 'day'): Promise<KLineData[]> {
  const secid = market === 'sh' ? `1.${code}` :
                market === 'sz' ? `0.${code}` :
                market === 'hk' ? `116.${code}` :
                market === 'us' ? `105.${code}` : `1.${code}`;
  
  // period: 101=日K, 102=周K, 103=月K
  const periodMap: Record<string, string> = {
    'day': '101',
    'week': '102', 
    'month': '103'
  };
  
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${periodMap[period] || '101'}&fqt=1&end=20500101&limit=120`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://quote.eastmoney.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const json = await response.json();
    
    if (!json.data?.klines) return [];
    
    // 格式: "日期,开盘,收盘,最低,最高,成交量,成交额,振幅,涨跌幅,涨跌额,换手率"
    return json.data.klines.map((line: string) => {
      const parts = line.split(',');
      return {
        date: parts[0]!,
        open: parseFloat(parts[1]!),
        close: parseFloat(parts[2]!),
        low: parseFloat(parts[3]!),
        high: parseFloat(parts[4]!),
        volume: parseInt(parts[5]!),
        amount: parseFloat(parts[6]!)
      };
    });
    
  } catch (error) {
    console.error('Failed to fetch EastMoney K-line:', error);
    return [];
  }
}

// GET /api/stocks/[code]/kline - 获取K线数据
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market') || 'sh';
    const period = searchParams.get('period') || 'day';
    
    const { code } = await params;
    
    // 尝试多个数据源
    let data = await fetchEastMoneyKLine(code, market, period);
    
    if (data.length === 0) {
      data = await fetchSinaDailyKLine(code, market);
    }
    
    if (data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No K-line data available' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: data,
      meta: {
        code,
        market,
        period,
        count: data.length
      }
    });
    
  } catch (error) {
    console.error('K-line API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch K-line data' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
