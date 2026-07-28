import prisma from '@/lib/prisma';

// 资讯数据源输入结构（key 为解析器标识：wallstcn / xuangubao）
export type TNewsSourceInput = {
  key: string;
  name: string;
  url?: string | null;
  params?: string | null;
  description?: string | null;
  enabled?: boolean;
};

export const listNewsSources = async () => {
  return prisma.newsSource.findMany({ orderBy: { id: 'asc' } });
};

export const listEnabledNewsSources = async () => {
  return prisma.newsSource.findMany({ where: { enabled: true }, orderBy: { id: 'asc' } });
};

export const createNewsSource = async (input: TNewsSourceInput) => {
  return prisma.newsSource.create({
    data: {
      key: input.key,
      name: input.name,
      url: input.url ?? null,
      params: input.params ?? null,
      description: input.description ?? null,
      enabled: input.enabled ?? true
    }
  });
};

export const updateNewsSource = async (id: number, input: Partial<Omit<TNewsSourceInput, 'key'>>) => {
  return prisma.newsSource.update({ where: { id }, data: input });
};

export const deleteNewsSource = async (id: number) => {
  return prisma.newsSource.delete({ where: { id } });
};

// 记录一次同步结果（成功新增条数或失败状态）
export const markNewsSourceSync = async (id: number, status: 'success' | 'failed', count?: number) => {
  return prisma.newsSource.update({
    where: { id },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      lastSyncCount: count ?? null
    }
  });
};
