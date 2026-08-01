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

    // 行情总览页的指数清单（stock_dict，code 为 fullCode，type='index'）
    const indices = [
      { code: 'SH000001', name: '上证指数', market: 'SH' },
      { code: 'SZ399001', name: '深证成指', market: 'SZ' },
      { code: 'SZ399006', name: '创业板指', market: 'SZ' },
      { code: 'SH000688', name: '科创50', market: 'SH' },
      { code: 'SZ399330', name: '深证100', market: 'SZ' },
      { code: 'SH000300', name: '沪深300', market: 'SH' },
      { code: 'SH000905', name: '中证500', market: 'SH' },
      { code: 'SH000852', name: '中证1000', market: 'SH' },
    ] as const;
    for (const idx of indices) {
      await prisma.stockDict.upsert({
        where: { code: idx.code },
        update: { name: idx.name },
        create: { code: idx.code, name: idx.name, market: idx.market, type: 'index' },
      });
    }
    console.log(`stock_dict: ${indices.length} indices upserted`);

    // 内置角色（users.role 存角色 key；admin 恒全权限，member 默认权限见下）
    const adminRole = await prisma.role.upsert({
      where: { key: 'admin' },
      update: { name: '管理员', builtin: true },
      create: { key: 'admin', name: '管理员', builtin: true },
    });
    const memberRole = await prisma.role.upsert({
      where: { key: 'member' },
      update: { name: 'VIP用户', builtin: true },
      create: { key: 'member', name: 'VIP用户', builtin: true },
    });
    console.log(`role: admin/member upserted (ids=${adminRole.id},${memberRole.id})`);

    // member 默认路由权限（与 src/lib/route-perm.ts 的兜底默认值保持一致）；
    // 已存在的行不覆盖 —— 管理员可能在设置页权限矩阵里调整过
    const memberDefaultPerms = [
      ['/dashboard', 'rw'],
      ['/pool', 'rw'],
      ['/positions', 'rw'],
      ['/ashare', 'rw'],
      ['/analysis', 'rw'],
      ['/lhb', 'rw'],
      ['/cron', 'hidden'],
      ['/agent', 'rw'],
    ] as const;
    for (const [route, level] of memberDefaultPerms) {
      await prisma.roleRoutePermission.upsert({
        where: { roleId_route: { roleId: memberRole.id, route } },
        update: {},
        create: { roleId: memberRole.id, route, level },
      });
    }
    console.log(`role_perm: ${memberDefaultPerms.length} member default rows upserted`);
    console.log('seed done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('seed failed:', err);
  process.exit(1);
});
