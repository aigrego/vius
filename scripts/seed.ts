/**
 * Seed 脚本 —— 运行：npm run db:seed（幂等）
 *
 * 确保管理员账号存在：username 'admin'、role 'admin'、name '管理员'，
 * 密码取 SEED_ADMIN_PASSWORD（默认 'admin123'）的 bcrypt 哈希。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 手动加载 .env（Next 只在 `next` 命令下自动加载，tsx 脚本需要自己读）。
for (const file of ['.env.local', '.env']) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (process.env[k] === undefined) process.env[k] = v.replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const bcrypt = (await import('bcryptjs')).default;
  const prisma = new PrismaClient();

  try {
    const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.user.upsert({
      where: { username: 'admin' },
      update: { passwordHash, role: 'admin', name: '管理员' },
      create: {
        username: 'admin',
        passwordHash,
        name: '管理员',
        role: 'admin',
      },
    });
    console.log(
      `user: admin upserted (id=${admin.id}, password from ${
        process.env.SEED_ADMIN_PASSWORD ? 'SEED_ADMIN_PASSWORD' : 'default admin123'
      })`,
    );
    console.log('seed done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
