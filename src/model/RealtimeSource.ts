import prisma from '@/lib/prisma';

// 实时行情数据源（key 为解析器标识：sina / tencent / eastmoney）
// 解析器固定在 src/lib/realtime.ts，数据源只做启停与顺序管理，不支持新增/删除

export type TRealtimeSourceInput = {
  key: string;
  name: string;
  sort?: number;
  description?: string | null;
  enabled?: boolean;
};

// 内置默认源（realtime_source 为空时自动补齐；sort 即降级顺序）
export const DEFAULT_REALTIME_SOURCES: TRealtimeSourceInput[] = [
  { key: 'sina', name: '新浪财经', sort: 1, description: 'hq.sinajs.cn 实时快照' },
  { key: 'tencent', name: '腾讯财经', sort: 2, description: 'qt.gtimg.cn 实时快照' },
  { key: 'eastmoney', name: '东方财富', sort: 3, description: 'push2.eastmoney.com 实时快照' }
];

export const listRealtimeSources = async () => {
  return prisma.realtimeSource.findMany({ orderBy: { sort: 'asc' } });
};

export const listEnabledRealtimeSources = async () => {
  return prisma.realtimeSource.findMany({ where: { enabled: true }, orderBy: { sort: 'asc' } });
};

// 空表时补齐三个默认源（createMany skipDuplicates，重复调用安全）
export const ensureDefaultRealtimeSources = async () => {
  await prisma.realtimeSource.createMany({
    data: DEFAULT_REALTIME_SOURCES.map(s => ({
      key: s.key,
      name: s.name,
      sort: s.sort ?? 0,
      description: s.description ?? null,
      enabled: s.enabled ?? true
    })),
    skipDuplicates: true
  });
};

export const updateRealtimeSource = async (
  id: number,
  input: Partial<Pick<TRealtimeSourceInput, 'name' | 'sort' | 'description' | 'enabled'>>
) => {
  return prisma.realtimeSource.update({ where: { id }, data: input });
};
