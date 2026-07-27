import { prisma } from '@/lib/prisma';

/* 用户邮箱（UserEmail）辅助：多邮箱登录 / OAuth 邮箱落表 / 主邮箱惰性回填。
   邮箱一律小写存储，全局唯一（任一邮箱可作为登录账号）。 */

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/* 惰性回填：用户没有任何邮箱记录且 username 本身是邮箱时，自动建主邮箱（manual）。 */
export async function backfillPrimaryEmail(user: { id: string; username: string }): Promise<void> {
  if (!isEmail(user.username)) return;
  const count = await prisma.userEmail.count({ where: { userId: user.id } });
  if (count > 0) return;
  // 并发重复创建 / 邮箱被占用时静默忽略（唯一约束兜底）
  await prisma.userEmail
    .create({
      data: { userId: user.id, email: normalizeEmail(user.username), isPrimary: true, source: 'manual' },
    })
    .catch(() => {});
}

/* OAuth 登录带回的邮箱落表：已被占用（任何账号）则跳过；用户无主邮箱时置主。 */
export async function upsertOAuthEmail(
  userId: string,
  email: string,
  source: 'feishu' | 'lark',
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isEmail(normalized)) return;
  const existing = await prisma.userEmail.findUnique({ where: { email: normalized } });
  if (existing) return;
  const hasPrimary = await prisma.userEmail.findFirst({ where: { userId, isPrimary: true } });
  await prisma.userEmail
    .create({ data: { userId, email: normalized, isPrimary: !hasPrimary, source } })
    .catch(() => {});
}
