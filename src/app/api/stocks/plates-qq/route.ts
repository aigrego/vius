import { NextResponse } from 'next/server';

// 声明为动态路由：实时板块排行，禁止缓存
export const dynamic = 'force-dynamic';

/* 腾讯行业板块排行代理（行情总览页「行业板块」卡片）。
   proxy.finance.qq.com 无 CORS 头，浏览器直连会被拦截，改为服务端转发，
   响应原样透传（{code:0, data:{rank_list:[...]}}）。 */
const UPSTREAM =
  'https://proxy.finance.qq.com/cgi/cgi-bin/rank/pt/getRank?board_type=hy&sort_type=priceRatio&direct=down&offset=0&count=40';

export const GET = async () => {
  try {
    const resp = await fetch(UPSTREAM, {
      signal: AbortSignal.timeout(8000),
      headers: {
        Referer: 'https://stockapp.finance.qq.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    if (!resp.ok) throw new Error(`upstream ${resp.status}`);
    const json = await resp.json();
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ code: 500, data: null, message: '板块行情获取失败' }, { status: 502 });
  }
};
