import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!(global as any).prisma) {
    (global as any).prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
    });
  }
  prisma = (global as any).prisma;
}

// 默认导出供数据层使用；具名导出供 auth 等其他模块按 `import { prisma }` 契约使用
export { prisma };
export default prisma;
