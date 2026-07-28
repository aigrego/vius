'use client';

import { useEffect, useState, useCallback } from 'react';

export interface RealtimeStock {
  code: string;
  name: string;
  open: number;
  close: number;
  current: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  changePct: number;
  pnlPct: number;
  pnlAmount: number;
  cost: number;
  source?: string;
  market?: string;
  updatedAt?: string;
}

interface RealtimeMeta {
  source: string;
  count: number;
  total: number;
}

interface UseRealtimeOptions {
  interval?: number;  // 轮询间隔，默认 5000ms
  enabled?: boolean;  // 是否启用，默认 true
  url?: string;       // 行情接口，默认股票池实时行情
}

export function useRealtimeData(options: UseRealtimeOptions = {}) {
  const { interval = 5000, enabled = true, url = '/stock-pool/api/realtime' } = options;
  
  const [data, setData] = useState<Record<string, RealtimeStock>>({});
  const [meta, setMeta] = useState<RealtimeMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch');
      
      const result = await response.json();
      if (result.success) {
        setData(result.data);
        setMeta(result.meta || null);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (e) {
      setError('获取实时数据失败');
      console.error('Realtime fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // 自调度轮询：上一次请求完成后再安排下一次，避免请求叠加
    const tick = async () => {
      await fetchData();
      if (!cancelled) {
        timer = setTimeout(tick, interval);
      }
    };

    // 立即执行一次
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchData, interval, enabled]);

  const refresh = useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return {
    data,
    meta,
    loading,
    error,
    lastUpdated,
    refresh,
    connected: !error
  };
}
