import type { NextConfig } from 'next';

// 观微 vius：instrumentation hook 在 Next 15+ 已稳定，register() 自动调用（见 src/instrumentation.ts）
const nextConfig: NextConfig = {
  // 旧页面路由兼容跳转（页面已改名 dashboard/pool/positions/ashare/analysis；
  // 精确匹配，不影响 /stock/[code] 详情页与 /stock-pool/api/* 接口）
  async redirects() {
    return [
      { source: '/stock', destination: '/dashboard', permanent: false },
      { source: '/stock-pool', destination: '/pool', permanent: false },
      { source: '/stock-pool/positions', destination: '/positions', permanent: false },
      { source: '/stock-pool/ashare', destination: '/ashare', permanent: false },
      { source: '/stock-pool/analysis', destination: '/analysis', permanent: false },
    ];
  },
};

export default nextConfig;
