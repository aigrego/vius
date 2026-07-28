import prisma from '@/lib/prisma';

// 龙虎榜数据源输入结构
export type TLhbSourceInput = {
  name: string;
  type?: string;
  url?: string | null;
  apiKey?: string | null;
  cron?: string | null;
  description?: string | null;
  enabled?: boolean;
};

export const listLhbSources = async () => {
  return prisma.lhbSource.findMany({ orderBy: { id: 'asc' } });
};

export const listEnabledLhbSources = async () => {
  return prisma.lhbSource.findMany({ where: { enabled: true }, orderBy: { id: 'asc' } });
};

export const createLhbSource = async (input: TLhbSourceInput) => {
  return prisma.lhbSource.create({
    data: {
      name: input.name,
      type: input.type ?? 'api',
      url: input.url ?? null,
      apiKey: input.apiKey ?? null,
      cron: input.cron ?? null,
      description: input.description ?? null,
      enabled: input.enabled ?? true
    }
  });
};

export const updateLhbSource = async (id: number, input: Partial<TLhbSourceInput>) => {
  return prisma.lhbSource.update({ where: { id }, data: input });
};

export const deleteLhbSource = async (id: number) => {
  return prisma.lhbSource.delete({ where: { id } });
};

// 记录一次同步结果（成功条数或失败状态）
export const markLhbSourceSync = async (id: number, status: 'success' | 'failed', count?: number) => {
  return prisma.lhbSource.update({
    where: { id },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: status,
      lastSyncCount: count ?? null
    }
  });
};
